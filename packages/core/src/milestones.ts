import type { ReadingMode } from "./reading-credit";
import { isMeasurableSitting } from "./reading-rates";
import { wpmFrom } from "./speed-model";
import { streakFromDays } from "./streak";

export const MILESTONE_KINDS = ["words", "hours", "books", "streak", "rsvpWpm"] as const;
export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

export const MILESTONE_TIERS: Record<MilestoneKind, readonly number[]> = {
	words: [100_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000],
	hours: [10, 25, 50, 100, 250, 500, 1000],
	books: [1, 5, 10, 25, 50, 100, 250],
	streak: [7, 14, 30, 60, 100, 365],
	rsvpWpm: [300, 400, 500, 600, 700, 800],
};

/** An RSVP sitting shorter than this can't set a speed milestone: one fast minute is noise. */
export const MILESTONE_SITTING_MIN_MS = 5 * 60_000;

export interface MilestoneSession {
	mode: ReadingMode;
	startedAt: number;
	durationMs: number;
	wordsRead: number;
}

export interface MilestoneInput {
	sessions: readonly MilestoneSession[];
	/** Finish instants of the reader's finished books. */
	finishedAt: readonly number[];
	/** The `YYYY-MM-DD` reading days one sitting counts toward, in the reader's own zone. */
	dayKeysOf: (startedAt: number) => string[];
}

export interface ReachedMilestone {
	kind: MilestoneKind;
	threshold: number;
	reachedAt: number;
}

export interface NextMilestone {
	kind: MilestoneKind;
	threshold: number;
	/** The reader's current value in the tier's unit (words, hours, books, days, wpm). */
	current: number;
}

export interface Milestones {
	/** The highest tier reached of each kind, newest first. */
	reached: ReachedMilestone[];
	/** The next tier of each kind still open, closest first. */
	next: NextMilestone[];
}

type Point = { at: number; value: number };

/** The instant a running total first reaches each threshold. */
function crossings(points: readonly Point[], tiers: readonly number[]): (number | null)[] {
	return tiers.map((tier) => points.find((p) => p.value >= tier)?.at ?? null);
}

function cumulative(items: readonly { at: number; amount: number }[]): Point[] {
	let total = 0;
	return [...items]
		.sort((a, b) => a.at - b.at)
		.map((item) => {
			total += item.amount;
			return { at: item.at, value: total };
		});
}

function runningBest(items: readonly { at: number; amount: number }[]): Point[] {
	let best = 0;
	return [...items]
		.sort((a, b) => a.at - b.at)
		.map((item) => {
			best = Math.max(best, item.amount);
			return { at: item.at, value: best };
		});
}

/**
 * The longest streak after each read day, replayed through `streakFromDays` so
 * freezes count exactly as the stats page counts them. Prefixes are probed by
 * binary search per tier: a longest streak never shrinks as days are added.
 */
function streakPoints(input: MilestoneInput): {
	crossingAt: (tier: number) => number | null;
	current: number;
} {
	const firstAtByDay = new Map<string, number>();
	for (const s of input.sessions) {
		if (s.durationMs <= 0) continue;
		for (const day of input.dayKeysOf(s.startedAt)) {
			const prev = firstAtByDay.get(day);
			if (prev === undefined || s.startedAt < prev) firstAtByDay.set(day, s.startedAt);
		}
	}
	const days = [...firstAtByDay.keys()].sort();
	const longestThrough = (index: number): number => {
		const prefix = new Set(days.slice(0, index + 1));
		return streakFromDays(prefix, days[index]).longest;
	};
	const current = days.length > 0 ? longestThrough(days.length - 1) : 0;
	const crossingAt = (tier: number): number | null => {
		if (current < tier) return null;
		let lo = 0;
		let hi = days.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (longestThrough(mid) >= tier) hi = mid;
			else lo = mid + 1;
		}
		return firstAtByDay.get(days[lo]) ?? null;
	};
	return { crossingAt, current };
}

/**
 * Milestones derived from sessions and finished books, so nothing is stored and
 * the app and the server profile agree on the same rows.
 */
export function deriveMilestones(input: MilestoneInput): Milestones {
	const sessions = input.sessions.filter((s) => s.durationMs > 0 || s.wordsRead > 0);
	const words = cumulative(sessions.map((s) => ({ at: s.startedAt, amount: s.wordsRead })));
	const hours = cumulative(
		sessions.map((s) => ({ at: s.startedAt, amount: s.durationMs / 3_600_000 })),
	);
	const books = cumulative(input.finishedAt.map((at) => ({ at, amount: 1 })));
	const rsvp = runningBest(
		input.sessions
			.filter(
				(s) =>
					s.mode === "rsvp" && s.durationMs >= MILESTONE_SITTING_MIN_MS && isMeasurableSitting(s),
			)
			.map((s) => ({ at: s.startedAt, amount: wpmFrom(s.wordsRead, s.durationMs) ?? 0 })),
	);
	const streak = streakPoints(input);

	const lastValue = (points: Point[]) => points[points.length - 1]?.value ?? 0;
	const series: Record<MilestoneKind, { reachedAt: (number | null)[]; current: number }> = {
		words: { reachedAt: crossings(words, MILESTONE_TIERS.words), current: lastValue(words) },
		hours: { reachedAt: crossings(hours, MILESTONE_TIERS.hours), current: lastValue(hours) },
		books: { reachedAt: crossings(books, MILESTONE_TIERS.books), current: lastValue(books) },
		streak: {
			reachedAt: MILESTONE_TIERS.streak.map(streak.crossingAt),
			current: streak.current,
		},
		rsvpWpm: { reachedAt: crossings(rsvp, MILESTONE_TIERS.rsvpWpm), current: lastValue(rsvp) },
	};

	const reached: ReachedMilestone[] = [];
	const next: (NextMilestone & { share: number })[] = [];
	for (const kind of MILESTONE_KINDS) {
		const tiers = MILESTONE_TIERS[kind];
		const { reachedAt, current } = series[kind];
		let top = -1;
		reachedAt.forEach((at, i) => {
			if (at !== null) top = i;
		});
		const topAt = reachedAt[top];
		if (top >= 0 && topAt != null) reached.push({ kind, threshold: tiers[top], reachedAt: topAt });
		const open = tiers[top + 1];
		// RSVP speed only becomes a goal once the reader has an RSVP sitting to measure.
		if (open !== undefined && (kind !== "rsvpWpm" || current > 0)) {
			const value = kind === "hours" ? Math.floor(current) : Math.round(current);
			next.push({ kind, threshold: open, current: value, share: current / open });
		}
	}
	reached.sort((a, b) => b.reachedAt - a.reachedAt);
	next.sort((a, b) => b.share - a.share);
	return { reached, next: next.map(({ share: _share, ...rest }) => rest) };
}

/** The milestones whose crossing sitting started within `[from, to)`: what one visit earned. */
export function milestonesReachedBetween(
	milestones: Milestones,
	from: number,
	to: number,
): ReachedMilestone[] {
	return milestones.reached.filter((m) => m.reachedAt >= from && m.reachedAt < to);
}
