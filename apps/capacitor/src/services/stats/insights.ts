import { type MeasuredReadingMode, wpmFrom } from "@lesefluss/core";
import { SEGMENT_MS } from "../reading-sessions/rules";

/** Reading time each side of a comparison needs before its speed means anything. */
export const INSIGHT_MIN_ACTIVE_MS = 30 * 60_000;
export const TIME_OF_DAY_MIN_SITTINGS = 3;
/** Sittings with a full FATIGUE_MIN_SEGMENTS segments the fatigue point needs, per segment. */
export const FATIGUE_MIN_SITTINGS = 3;
export const FATIGUE_MIN_SEGMENTS = 3;
/** A segment at or below this share of the sitting's opening pace counts as slowing down. */
export const FATIGUE_DROP_RATIO = 0.92;

export type InsightRow = {
	mode: MeasuredReadingMode;
	startedAt: number;
	durationMs: number;
	wordsRead: number;
	fontSize: number | null;
	segmentWpm: number[] | null;
};

export type InsightId = "scroll-vs-page" | "time-of-day" | "font-size" | "fatigue";

export type Insight = {
	id: InsightId;
	label: string;
	value: string;
	sub: string;
};

export type DayBand = "morning" | "afternoon" | "evening" | "night";

const BAND_LABELS: Record<DayBand, string> = {
	morning: "Morning",
	afternoon: "Afternoon",
	evening: "Evening",
	night: "Night",
};

/** Local hour bands: morning 5-12, afternoon 12-17, evening 17-22, night 22-5. */
export function dayBandOf(at: number): DayBand {
	const hour = new Date(at).getHours();
	if (hour >= 5 && hour < 12) return "morning";
	if (hour >= 12 && hour < 17) return "afternoon";
	if (hour >= 17 && hour < 22) return "evening";
	return "night";
}

type Group = { words: number; activeMs: number; sittings: number };

function groupBy<K>(
	rows: readonly InsightRow[],
	keyOf: (row: InsightRow) => K | null,
): Map<K, Group> {
	const groups = new Map<K, Group>();
	for (const row of rows) {
		const key = keyOf(row);
		if (key === null) continue;
		const group = groups.get(key) ?? { words: 0, activeMs: 0, sittings: 0 };
		group.words += row.wordsRead;
		group.activeMs += row.durationMs;
		group.sittings++;
		groups.set(key, group);
	}
	return groups;
}

function signedPercent(value: number): string {
	return value < 0 ? `−${Math.abs(value)}%` : `+${value}%`;
}

/** The fastest of the groups with enough time, and how far it beats all of them together. */
function bestGroup<K>(groups: Map<K, Group>): { key: K; wpm: number; percent: number } | null {
	const qualified = [...groups].filter(([, g]) => g.activeMs >= INSIGHT_MIN_ACTIVE_MS);
	if (qualified.length < 2) return null;
	let words = 0;
	let activeMs = 0;
	let best: { key: K; wpm: number } | null = null;
	for (const [key, g] of qualified) {
		words += g.words;
		activeMs += g.activeMs;
		const wpm = wpmFrom(g.words, g.activeMs) ?? 0;
		if (!best || wpm > best.wpm) best = { key, wpm };
	}
	const overall = wpmFrom(words, activeMs);
	if (!best || overall === null) return null;
	return { ...best, percent: Math.round((best.wpm / overall - 1) * 100) };
}

export function scrollVsPage(rows: readonly InsightRow[]): Insight | null {
	const groups = groupBy(rows, (r) => (r.mode === "rsvp" ? null : r.mode));
	const scroll = groups.get("scroll");
	const page = groups.get("page");
	if (!scroll || !page) return null;
	if (scroll.activeMs < INSIGHT_MIN_ACTIVE_MS || page.activeMs < INSIGHT_MIN_ACTIVE_MS) return null;
	const scrollWpm = wpmFrom(scroll.words, scroll.activeMs) ?? 0;
	const pageWpm = wpmFrom(page.words, page.activeMs) ?? 0;
	const faster = scrollWpm >= pageWpm ? "Scroll" : "Page";
	const fast = Math.max(scrollWpm, pageWpm);
	const slow = Math.min(scrollWpm, pageWpm);
	const percent = slow > 0 ? Math.round((fast / slow - 1) * 100) : 0;
	return {
		id: "scroll-vs-page",
		label: "Scroll vs page",
		value: percent === 0 ? "Even" : `${faster} ${signedPercent(percent)}`,
		sub: `${scrollWpm} vs ${pageWpm} wpm`,
	};
}

export function fastestTimeOfDay(rows: readonly InsightRow[]): Insight | null {
	if (rows.length < TIME_OF_DAY_MIN_SITTINGS) return null;
	const best = bestGroup(groupBy(rows, (r) => dayBandOf(r.startedAt)));
	if (!best) return null;
	return {
		id: "time-of-day",
		label: "Fastest time",
		value: BAND_LABELS[best.key],
		sub: `${signedPercent(best.percent)} · ${best.wpm} wpm`,
	};
}

export function speedByFontSize(
	rows: readonly InsightRow[],
	view: "reading" | "rsvp",
): Insight | null {
	const best = bestGroup(groupBy(rows, (r) => r.fontSize));
	if (!best) return null;
	return {
		id: "font-size",
		label: view === "rsvp" ? "Best word size" : "Best size",
		value: `${best.key} px`,
		sub: `${signedPercent(best.percent)} · ${best.wpm} wpm`,
	};
}

/**
 * Each sitting's segments as shares of its own opening pace (the mean of its
 * first two segments), so a fast and a slow book don't read as a drop.
 */
function relativeSegments(segments: readonly number[]): number[] | null {
	const opening = (segments[0] + segments[1]) / 2;
	if (opening <= 0) return null;
	return segments.map((wpm) => wpm / opening);
}

export function fatiguePoint(rows: readonly InsightRow[]): Insight | null {
	const sittings = rows
		.map((r) => r.segmentWpm)
		.filter((s): s is number[] => s !== null && s.length >= FATIGUE_MIN_SEGMENTS)
		.map(relativeSegments)
		.filter((s): s is number[] => s !== null);
	if (sittings.length < FATIGUE_MIN_SITTINGS) return null;
	const segmentMin = SEGMENT_MS / 60_000;
	let steadyTo = 0;
	for (let k = 2; ; k++) {
		const shares = sittings.filter((s) => s.length > k).map((s) => s[k]);
		if (shares.length < FATIGUE_MIN_SITTINGS) break;
		const mean = shares.reduce((sum, share) => sum + share, 0) / shares.length;
		if (mean <= FATIGUE_DROP_RATIO) {
			return {
				id: "fatigue",
				label: "Slows after",
				value: `${k * segmentMin}m`,
				sub: signedPercent(Math.round((mean - 1) * 100)),
			};
		}
		steadyTo = (k + 1) * segmentMin;
	}
	return { id: "fatigue", label: "Slows after", value: "None", sub: `Steady to ${steadyTo}m` };
}

/** The insight tiles for one Speed tab view, each left out until its data is in. */
export function speedInsights(rows: readonly InsightRow[], view: "reading" | "rsvp"): Insight[] {
	const viewRows = rows.filter((r) => (view === "rsvp" ? r.mode === "rsvp" : r.mode !== "rsvp"));
	const insights = [
		view === "reading" ? scrollVsPage(viewRows) : null,
		fastestTimeOfDay(viewRows),
		speedByFontSize(viewRows, view),
		fatiguePoint(viewRows),
	];
	return insights.filter((i): i is Insight => i !== null);
}
