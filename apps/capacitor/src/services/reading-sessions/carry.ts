import type { MeasuredReadingMode } from "@lesefluss/core";
import { localDateKey } from "../../utils/date-utils";
import { HARD_END_MS } from "./rules";

/**
 * A sitting that ended below the noise floor, kept so the next burst on the
 * same book can add to it: pausing, closing and reopening, switching modes or
 * a Quick RSVP window would otherwise leave only bursts that each fall short of a minute.
 */
export type SittingCarry = {
	id: string;
	bookId: string;
	dayKey: string;
	startedAt: number;
	startPos: number;
	readSpans: [start: number, end: number][];
	accumulatedActiveMs: number;
	/** The same active time, split by the mode it was read in. */
	modeActiveMs: Partial<Record<MeasuredReadingMode, number>>;
	/** The RSVP dial of the carried RSVP reading; null when none of it was RSVP. */
	rsvpDialWpm: number | null;
	lastActivityAt: number;
};

export type CarryStore = {
	stash(carry: SittingCarry): void;
	/** The book's carry when the next burst starts close enough to join it, at most once. */
	take(bookId: string, now: number): SittingCarry | null;
	/** Drops every carry: what they hold belongs to an account or history that is gone. */
	clear(): void;
};

/** A carry joins a burst under the same rule that keeps one sitting open: a pause up to HARD_END_MS, the same day. */
export function createCarryStore(): CarryStore {
	const carries = new Map<string, SittingCarry>();
	return {
		stash(carry) {
			carries.set(carry.bookId, carry);
		},
		take(bookId, now) {
			const carry = carries.get(bookId);
			if (!carry) return null;
			carries.delete(bookId);
			if (now - carry.lastActivityAt > HARD_END_MS || now < carry.lastActivityAt) return null;
			if (localDateKey(now) !== carry.dayKey) return null;
			return carry;
		},
		clear() {
			carries.clear();
		},
	};
}

export const sittingCarries = createCarryStore();
