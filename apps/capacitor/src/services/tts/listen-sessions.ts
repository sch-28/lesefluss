import { wordPos } from "@lesefluss/core";
import { localDateKey, startOfLocalDay } from "../../utils/date-utils";
import { randomSessionId } from "../../utils/random-id";
import {
	HARD_END_MS,
	MIN_DURATION_MS,
	MIN_WORDS,
	type SessionRow,
} from "../reading-sessions/rules";

/** Continuous playback from one word to another, as the voice's log reports it. */
export type ListenInterval = {
	startedAt: number;
	endedAt: number;
	startWord: number;
	endWord: number;
};

const KEPT_SITTINGS = 3;
const PAST_NEXT_MIDNIGHT_MS = 36 * 3_600_000;

type Sitting = {
	id: string;
	dayKey: string;
	/** Keyed by start time: the log repeats the running interval, longer each time. */
	intervals: Map<number, ListenInterval>;
	hasPersisted: boolean;
};

/**
 * Turns the voice's playback log into `listen` reading sessions. A sitting
 * spans playback with pauses shorter than the reading tracker's hard end, and
 * never crosses local midnight, so each day keeps its own row like reading
 * does. Duration is time spoken, not the sitting's wall-clock span.
 */
export class ListenRecorder {
	private readonly bookId: string;
	private readonly newId: () => string;
	// The recent sittings: a running interval split at midnight keeps feeding both days' rows.
	private readonly sittings: Sitting[] = [];
	/** Playback before this was in a sitting deleted on another device; see `forgetDeleted`. */
	private ignoreBefore = Number.NEGATIVE_INFINITY;

	constructor(bookId: string, newId: () => string = randomSessionId) {
		this.bookId = bookId;
		this.newId = newId;
	}

	/**
	 * Sittings deleted on another device are dropped, along with all playback up to
	 * `now`: the log keeps repeating the running interval from its start, which would
	 * otherwise rebuild the deleted time under a new id. Listening from here on is a
	 * new sitting. Returns the ids dropped.
	 */
	forgetDeleted(ids: ReadonlySet<string>, now: number): string[] {
		const dropped = this.sittings.filter((s) => ids.has(s.id));
		if (dropped.length === 0) return [];
		for (const sitting of dropped) this.sittings.splice(this.sittings.indexOf(sitting), 1);
		this.ignoreBefore = Math.max(this.ignoreBefore, now);
		return dropped.map((s) => s.id);
	}

	/** Rows for every sitting the intervals touched, to upsert as they come. */
	ingest(intervals: readonly ListenInterval[], now: number): SessionRow[] {
		const touched: Sitting[] = [];
		const pieces = intervals
			.flatMap((i) => clipBefore(i, this.ignoreBefore))
			.flatMap(splitAtMidnight)
			.sort((a, b) => a.startedAt - b.startedAt);
		for (const piece of pieces) {
			const sitting = this.sittingFor(piece);
			sitting.intervals.set(piece.startedAt, piece);
			if (!touched.includes(sitting)) touched.push(sitting);
		}
		return touched.flatMap((sitting) => {
			const row = this.rowOf(sitting, now);
			if (row) sitting.hasPersisted = true;
			return row ? [row] : [];
		});
	}

	private sittingFor(piece: ListenInterval): Sitting {
		const known = this.sittings.find((s) => s.intervals.has(piece.startedAt));
		if (known) return known;
		const dayKey = localDateKey(piece.startedAt);
		const current = this.sittings[this.sittings.length - 1];
		if (current?.dayKey === dayKey) {
			const lastEnd = Math.max(...[...current.intervals.values()].map((i) => i.endedAt));
			if (piece.startedAt - lastEnd <= HARD_END_MS) return current;
		}
		const sitting: Sitting = {
			id: this.newId(),
			dayKey,
			intervals: new Map(),
			hasPersisted: false,
		};
		this.sittings.push(sitting);
		if (this.sittings.length > KEPT_SITTINGS) this.sittings.shift();
		return sitting;
	}

	private rowOf(sitting: Sitting, now: number): SessionRow | null {
		const intervals = [...sitting.intervals.values()].sort((a, b) => a.startedAt - b.startedAt);
		const first = intervals[0];
		const last = intervals[intervals.length - 1];
		if (!first || !last) return null;
		let durationMs = 0;
		let furthest = first.startWord;
		for (const i of intervals) {
			durationMs += Math.max(0, i.endedAt - i.startedAt);
			furthest = Math.max(furthest, i.endWord);
		}
		// Text heard twice (a rewind after an interruption, skipping back) counts once.
		const wordsRead = coveredWords(intervals);
		if (!sitting.hasPersisted && (durationMs < MIN_DURATION_MS || wordsRead < MIN_WORDS))
			return null;
		return {
			id: sitting.id,
			bookId: this.bookId,
			mode: "listen",
			startedAt: first.startedAt,
			endedAt: last.endedAt,
			durationMs,
			wordsRead,
			startWord: wordPos(first.startWord),
			endWord: wordPos(last.endWord),
			furthestWord: wordsRead > 0 ? wordPos(furthest) : null,
			wpmAvg: null,
			updatedAt: now,
		};
	}
}

function coveredWords(intervals: readonly ListenInterval[]): number {
	const spans = intervals
		.filter((i) => i.endWord > i.startWord)
		.map((i) => [i.startWord, i.endWord] as const)
		.sort((a, b) => a[0] - b[0]);
	let words = 0;
	let reached = Number.NEGATIVE_INFINITY;
	for (const [start, end] of spans) {
		if (end <= reached) continue;
		words += end - Math.max(start, reached);
		reached = end;
	}
	return words;
}

/** The part of an interval from `cut` on, its words shared out by time. */
function clipBefore(interval: ListenInterval, cut: number): ListenInterval[] {
	if (interval.startedAt >= cut) return [interval];
	if (interval.endedAt <= cut) return [];
	const share = (cut - interval.startedAt) / (interval.endedAt - interval.startedAt);
	const startWord = Math.round(
		interval.startWord + share * (interval.endWord - interval.startWord),
	);
	return [{ ...interval, startedAt: cut, startWord }];
}

/** Cuts an interval at each local midnight, sharing its words out by time. */
function splitAtMidnight(interval: ListenInterval): ListenInterval[] {
	// The clock went back mid-interval (a correction, a time zone change): nothing to share out.
	if (interval.endedAt <= interval.startedAt) return [interval];
	const pieces: ListenInterval[] = [];
	let rest = interval;
	while (localDateKey(rest.startedAt) !== localDateKey(rest.endedAt)) {
		const cut = startOfLocalDay(startOfLocalDay(rest.startedAt) + PAST_NEXT_MIDNIGHT_MS);
		if (cut > rest.endedAt) break;
		const share = (cut - rest.startedAt) / (rest.endedAt - rest.startedAt);
		const cutWord = Math.round(rest.startWord + share * (rest.endWord - rest.startWord));
		pieces.push({ ...rest, endedAt: cut - 1, endWord: cutWord });
		rest = { ...rest, startedAt: cut, startWord: cutWord };
	}
	pieces.push(rest);
	return pieces;
}
