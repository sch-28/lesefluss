import type { MeasuredReadingMode } from "@lesefluss/core";
import { localDateKey } from "../../utils/date-utils";
import { HARD_END_MS } from "./rules";

/**
 * A sitting that ended below the noise floor, kept so the next burst on the
 * same book can add to it: pausing, closing and reopening, or a Quick RSVP
 * window would otherwise leave only bursts that each fall short of a minute.
 */
export type SittingCarry = {
	id: string;
	bookId: string;
	mode: MeasuredReadingMode;
	dayKey: string;
	startedAt: number;
	startPos: number;
	readSpans: [start: number, end: number][];
	accumulatedActiveMs: number;
	lastActivityAt: number;
};

export type CarryStore = {
	stash(carry: SittingCarry): void;
	/** The book's carry in this mode when the next burst starts close enough to join it, at most once. */
	take(bookId: string, mode: MeasuredReadingMode, now: number): SittingCarry | null;
};

/**
 * A carry joins a burst under the same rule that keeps one sitting open: a pause up to HARD_END_MS, the same day.
 * Only within one mode, since a row's mode decides which speed and time it counts for.
 */
export function createCarryStore(): CarryStore {
	const carries = new Map<string, SittingCarry>();
	const keyOf = (bookId: string, mode: MeasuredReadingMode) => `${mode}:${bookId}`;
	return {
		stash(carry) {
			carries.set(keyOf(carry.bookId, carry.mode), carry);
		},
		take(bookId, mode, now) {
			const key = keyOf(bookId, mode);
			const carry = carries.get(key);
			if (!carry) return null;
			carries.delete(key);
			if (now - carry.lastActivityAt > HARD_END_MS || now < carry.lastActivityAt) return null;
			if (localDateKey(now) !== carry.dayKey) return null;
			return carry;
		},
	};
}

export const sittingCarries = createCarryStore();
