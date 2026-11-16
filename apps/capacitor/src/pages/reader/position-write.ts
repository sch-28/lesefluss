import { wordPos } from "@lesefluss/core";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "../../components/toast";
import { bookKeys, serialKeys } from "../../services/db/hooks/query-keys";
import { queries } from "../../services/db/queries";
import { nextPositionRevision, type PositionRow } from "../../services/db/queries/books";
import type { SeriesActivity } from "../../services/db/queries/series";
import type { Book } from "../../services/db/schema";
import { recordOwnRevision } from "../../services/position-revisions";
import { scheduleSyncPush } from "../../services/sync";
import { reportEvent } from "../../services/telemetry";
import { publishSaveRequest, publishSyncPushRequest } from "../../test-hooks/reader";
import { setJustRead } from "../library/just-read-pin";
import { clearOwnPendingPosition, writePendingPosition } from "./pending-position";

// A write that hasn't settled in this long is treated as wedged and reported.
const POSITION_WRITE_TIMEOUT_MS = 8000;

// So a write that fails on every attempt can't toast on every scroll settle.
const SAVE_ERROR_TOAST_THROTTLE_MS = 120_000;
let lastSaveErrorToastAt = 0;

function notifyLocalSaveFailure() {
	const now = Date.now();
	if (now - lastSaveErrorToastAt < SAVE_ERROR_TOAST_THROTTLE_MS) return;
	lastSaveErrorToastAt = now;
	toast.error("Couldn't save your reading progress on this device. Try restarting the app.", {
		duration: 6000,
	});
}

export const SYNC_PUSH_DELAY_MS = 5000;

export function requestSyncPush(delayMs = SYNC_PUSH_DELAY_MS) {
	scheduleSyncPush(delayMs);
	if (import.meta.env.DEV) publishSyncPushRequest();
}

export type PositionWriteOutcome =
	| { kind: "written" }
	/** A newer position was written meanwhile (a sync pull, a device); `row` is the row now. */
	| { kind: "stale"; row: PositionRow | null }
	/** The DB write threw. The pending mirror stays for the next mount to recover. */
	| { kind: "failed" };

export type PositionWrite = {
	/** The revision this write stamps; known before the write lands, so a later write can build on it. */
	stamp: number;
	outcome: Promise<PositionWriteOutcome>;
};

export type PositionWriteInput = {
	bookId: string;
	seriesId: string | null;
	word: number;
	/** The newest row revision the writer has seen; the write lands only while the row is no newer. */
	baseRev: number;
};

/**
 * The one position write: the pending localStorage mirror first (it survives a
 * teardown that abandons the async write), the optimistic library caches, then
 * the DB write guarded by `baseRev`. Saves only what the caller says the user
 * moved to; the caller owns dedupe, the BLE push and the sync push.
 */
export function writeBookPosition(
	qc: QueryClient,
	{ bookId, seriesId, word, baseRev }: PositionWriteInput,
): PositionWrite {
	const now = Date.now();
	const wordPosition = wordPos(word);

	// Stamped with the `now` that becomes the row's lastRead, so recovery compares like with like.
	writePendingPosition(bookId, word, now);
	if (import.meta.env.DEV) publishSaveRequest();

	// The library lands already sorted on the way back instead of shifting after the refetch.
	qc.setQueryData<{ books: Book[]; covers: Map<string, string> } | undefined>(
		bookKeys.all,
		(prev) => {
			if (!prev) return prev;
			let changed = false;
			const next = prev.books.map((b) => {
				if (b.id !== bookId) return b;
				changed = true;
				return { ...b, wordPosition, lastRead: now };
			});
			return changed ? { ...prev, books: next } : prev;
		},
	);
	if (seriesId) {
		qc.setQueryData<Map<string, SeriesActivity> | undefined>(serialKeys.activity, (prev) => {
			if (!prev) return prev;
			const current = prev.get(seriesId);
			if (!current) return prev;
			const merged = new Map(prev);
			merged.set(seriesId, { ...current, latestRead: Math.max(current.latestRead ?? 0, now) });
			return merged;
		});
	}
	setJustRead(seriesId ? `series:${seriesId}` : `book:${bookId}`);

	const stamp = nextPositionRevision(now, baseRev);
	recordOwnRevision(bookId, stamp);

	const outcome = (async (): Promise<PositionWriteOutcome> => {
		// A wedged write queue or a stalled native bridge hangs without rejecting,
		// so the adapter's error path never sees it.
		let settled = false;
		const watchdog = setTimeout(() => {
			if (!settled) {
				reportEvent("position_write_timeout");
				notifyLocalSaveFailure();
			}
		}, POSITION_WRITE_TIMEOUT_MS);
		let result: Awaited<ReturnType<typeof queries.writeReaderPosition>>;
		try {
			result = await queries.writeReaderPosition(bookId, {
				wordPosition,
				lastRead: now,
				baseRev,
			});
		} catch {
			// The adapter already reported db_write_error; the user learns it didn't save.
			notifyLocalSaveFailure();
			return { kind: "failed" };
		} finally {
			settled = true;
			clearTimeout(watchdog);
		}
		// The row is no longer this write's to recover over, either way.
		clearOwnPendingPosition(bookId, { word, at: now });
		if (!result.isWritten) {
			void qc.invalidateQueries({ queryKey: bookKeys.all });
			return { kind: "stale", row: result.row };
		}
		return { kind: "written" };
	})();

	return { stamp, outcome };
}
