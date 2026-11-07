import type { QueryClient } from "@tanstack/react-query";
import { bookKeys } from "../../services/db/hooks/query-keys";
import type { PositionRow } from "../../services/db/queries/books";
import { writePendingPosition } from "../reader/pending-position";
import { createPersistedWord } from "../reader/persisted-word";
import { requestSyncPush, writeBookPosition } from "../reader/position-write";

export type BurstSaveResult = "written" | "unchanged" | "adopted" | "stale" | "failed";

export type BurstPosition = {
	/** The row as the strip now knows it: loaded, or a newer one it adopted. */
	seed(row: PositionRow): void;
	/** The newest row revision the strip has seen or written. */
	baseRev(): number;
	/** Saves the word the user read to; `pushNow` sends it to the server at once. */
	save(word: number, options?: { pushNow?: boolean }): Promise<BurstSaveResult>;
};

type Options = {
	qc: QueryClient;
	bookId: string;
	seriesId: string | null;
	/**
	 * The late-sync rule: a newer row written meanwhile is taken over only while
	 * this says so (no key pressed, under 5 words played); after that the
	 * strip's word wins.
	 */
	canAdoptRemote: () => boolean;
	onAdopt: (row: PositionRow) => void;
};

export function createBurstPosition({
	qc,
	bookId,
	seriesId,
	canAdoptRemote,
	onAdopt,
}: Options): BurstPosition {
	const persisted = createPersistedWord();
	let baseRev = 0;

	const write = (word: number) => {
		const pending = writeBookPosition(qc, {
			bookId,
			seriesId,
			word,
			baseRev,
			// An open reader on this book follows the write as an external position.
			isReaderOwn: false,
		});
		baseRev = Math.max(baseRev, pending.stamp);
		return pending.outcome;
	};

	const seed = (row: PositionRow) => {
		persisted.set(row.wordPosition);
		baseRev = Math.max(baseRev, row.updatedAt);
	};

	// One write at a time, so the hide's immediate push only starts once the
	// word it pushes has landed.
	let chain: Promise<unknown> = Promise.resolve();
	let latestWrite = 0;
	const queue = (run: () => Promise<BurstSaveResult>): Promise<BurstSaveResult> => {
		const next = chain.then(run);
		chain = next;
		return next;
	};

	const writeQueued = async (
		word: number,
		token: number,
		pushNow: boolean,
	): Promise<BurstSaveResult> => {
		let outcome = await write(word);
		if (outcome.kind === "stale") {
			const row = outcome.row;
			if (row && canAdoptRemote()) {
				seed(row);
				onAdopt(row);
				return "adopted";
			}
			baseRev = Math.max(baseRev, row?.updatedAt ?? 0);
			outcome = await write(word);
		}
		if (outcome.kind !== "written") {
			persisted.fail(token);
			return outcome.kind;
		}
		void qc.invalidateQueries({ queryKey: bookKeys.detail(bookId) });
		requestSyncPush(pushNow ? 0 : undefined);
		return "written";
	};

	return {
		seed,
		baseRev: () => baseRev,
		save(word, { pushNow = false } = {}) {
			if (!persisted.needsWrite(word)) {
				const requested = latestWrite;
				return queue(async () => {
					// The write in flight for this word failed meanwhile (an adopt or seed
					// sets a word instead): this save retries it.
					if (persisted.get() === null && requested === latestWrite) {
						return writeQueued(word, persisted.begin(word), pushNow);
					}
					if (pushNow) requestSyncPush(0);
					return "unchanged";
				});
			}
			const token = persisted.begin(word);
			// Mirrored now, not when the queued write starts: a teardown meanwhile keeps the word.
			writePendingPosition(bookId, word, Date.now());
			const seq = ++latestWrite;
			return queue(async () => {
				// A newer word is queued behind this one; writing this would replace its mirror.
				if (seq !== latestWrite) return "unchanged";
				return writeQueued(word, token, pushNow);
			});
		},
	};
}
