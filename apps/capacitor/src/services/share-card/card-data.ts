import {
	isMeasurableSitting,
	type ReachedMilestone,
	rsvpTimeSavedMs,
	type SpeedModel,
	wpmFrom,
} from "@lesefluss/core";
import { formatDuration } from "../../utils/date-utils";
import type { SessionRow } from "../reading-sessions/rules";
import { readingDaysOfSitting } from "../stats/aggregate";
import { compactNumber, milestoneFace } from "../stats/milestones";
import type { SummaryStats } from "../stats/session-summary";
import { timeSavedMs } from "../stats/speed-tab";
import type { ShareCardData, ShareCardTile } from "./render";

type CardBook = { title: string; author: string | null; coverImage: string | null };

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");

function monthYear(at: number): string {
	return new Date(at).toLocaleDateString("en", { month: "short", year: "numeric" });
}

function weekdayTime(at: number): string {
	const d = new Date(at);
	const day = d.toLocaleDateString("en", { weekday: "short" });
	const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
	return `${day} ${time}`;
}

/** The card for one sitting, from the numbers the session summary already shows. */
export function sessionCardData(input: {
	book: CardBook;
	stats: SummaryStats;
	startedAt: number;
	milestones?: readonly ReachedMilestone[];
}): ShareCardData {
	const { book, stats } = input;
	const tiles: ShareCardTile[] = [];
	if (stats.wpm !== null) {
		tiles.push({
			label: stats.isRsvp ? "RSVP wpm" : "wpm",
			value: String(stats.wpm),
			delta: stats.deltaWpm ? signed(stats.deltaWpm) : undefined,
			rsvp: stats.isRsvp,
		});
	}
	tiles.push({ label: "Words", value: compactNumber(stats.words) });
	if (stats.fromPercent !== null && stats.toPercent !== null) {
		const gained = Math.round((stats.toPercent - stats.fromPercent) * 10) / 10;
		tiles.push({ label: "Book", value: `+${gained}%` });
	}
	if (stats.rsvp) {
		tiles.push({
			label: "Saved by RSVP",
			value: formatDuration(stats.rsvp.savedMs),
			hot: true,
			wide: true,
		});
	}
	const reached = input.milestones?.[0];
	if (reached) {
		const face = milestoneFace(reached.kind, reached.threshold);
		tiles.push({ label: face.caption, value: face.value, wide: true, rsvp: face.rsvp });
	}
	return {
		kind: "book",
		kicker: `Session · ${weekdayTime(input.startedAt)}`,
		title: book.title,
		author: book.author,
		cover: book.coverImage,
		hero: formatDuration(stats.activeMs),
		progress:
			stats.fromPercent !== null && stats.toPercent !== null
				? { from: stats.fromPercent, to: stats.toPercent }
				: undefined,
		tiles,
		handle: null,
	};
}

/** The card for a finished book, over every sitting on it. */
export function finishedCardData(input: {
	book: CardBook & { wordCount: number; finishedAt: number };
	sessions: readonly Pick<SessionRow, "mode" | "startedAt" | "durationMs" | "wordsRead">[];
	model: SpeedModel | undefined;
}): ShareCardData {
	const { book, sessions, model } = input;
	let activeMs = 0;
	const reading = { words: 0, ms: 0 };
	const rsvp = { words: 0, ms: 0 };
	const days = new Set<string>();
	for (const s of sessions) {
		activeMs += s.durationMs;
		if (s.durationMs > 0) for (const day of readingDaysOfSitting(s.startedAt)) days.add(day);
		if (!isMeasurableSitting(s)) continue;
		const side = s.mode === "rsvp" ? rsvp : reading;
		side.words += s.wordsRead;
		side.ms += s.durationMs;
	}
	const readingWpm = wpmFrom(reading.words, reading.ms);
	const rsvpWpm = wpmFrom(rsvp.words, rsvp.ms);
	const time = { label: "Time", value: formatDuration(activeMs) };
	const dayTile = { label: "Days", value: String(days.size) };

	let tiles: ShareCardTile[];
	if (rsvpWpm !== null) {
		tiles = [
			time,
			{ label: "RSVP wpm", value: String(rsvpWpm), rsvp: true },
			{ label: "Reading wpm", value: readingWpm !== null ? String(readingWpm) : "–" },
			dayTile,
		];
		// Saved against the reader's own speed, so a book read only in RSVP still has a baseline.
		const baseline = model && model.reading.source !== "default" ? model.reading.wpm : readingWpm;
		const savedMs = baseline ? rsvpTimeSavedMs(rsvp.words, baseline, rsvpWpm) : 0;
		if (savedMs >= 60_000) {
			tiles.push({ label: "Saved by RSVP", value: formatDuration(savedMs), hot: true, wide: true });
		}
	} else {
		tiles = [
			time,
			{ label: "wpm", value: readingWpm !== null ? String(readingWpm) : "–" },
			dayTile,
			{ label: "Words", value: compactNumber(book.wordCount) },
		];
	}
	return {
		kind: "book",
		kicker: `Finished · ${monthYear(book.finishedAt)}`,
		title: book.title,
		author: book.author,
		cover: book.coverImage,
		tiles,
		handle: null,
	};
}

/** The Speed tab's card: this year's speed over a wall of the books behind it. */
export function speedCardData(input: {
	model: SpeedModel;
	trend: readonly number[];
	trendDeltaWpm: number | null;
	year: { minutes: number; words: number; booksFinished: number };
	covers: readonly string[];
	now: number;
}): ShareCardData {
	const { model, year } = input;
	const yearLabel = new Date(input.now).getFullYear();
	const tiles: ShareCardTile[] = [
		{ label: "Read", value: formatDuration(year.minutes * 60_000) },
		{ label: "Books", value: String(year.booksFinished) },
		{ label: "Words", value: compactNumber(year.words) },
	];
	let heroes: ShareCardTile[];
	if (model.rsvp && model.modesUsed.reading) {
		heroes = [
			{ label: "Reading wpm", value: String(model.reading.wpm) },
			{ label: "RSVP wpm", value: String(model.rsvp.wpm), hot: true, rsvp: true },
		];
		const savedMs = timeSavedMs(model);
		if (savedMs >= 60_000) tiles[2] = { label: "Saved", value: formatDuration(savedMs), hot: true };
	} else {
		const isRsvp = model.rsvp !== null && !model.modesUsed.reading;
		heroes = [
			{
				label: isRsvp ? "RSVP wpm" : "wpm",
				value: String(isRsvp ? (model.rsvp?.wpm ?? 0) : model.reading.wpm),
				delta: input.trendDeltaWpm ? signed(input.trendDeltaWpm) : undefined,
				rsvp: isRsvp,
			},
		];
	}
	return {
		kind: "speed",
		kicker: `Reading speed · ${yearLabel}`,
		covers: [...input.covers],
		heroes,
		trend: [...input.trend],
		tiles,
		handle: null,
	};
}
