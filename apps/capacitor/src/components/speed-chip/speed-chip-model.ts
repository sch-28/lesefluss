import type { SpeedModel, SpeedWindow } from "@lesefluss/core";

export type ChipMode = "reading" | "rsvp";

export type ChipPart = { mode: ChipMode; wpm: number };

export type ChipSpeeds = { reading?: number | null; rsvp?: number | null };

/**
 * The chip's numbers, the primary mode first. A mode shows only when it has a
 * speed; a reader with no sittings at all still gets the reading stand-in.
 */
export function chipParts(speeds: ChipSpeeds, primary: ChipMode = "reading"): ChipPart[] {
	const parts: ChipPart[] = [];
	if (speeds.reading != null) parts.push({ mode: "reading", wpm: speeds.reading });
	if (speeds.rsvp != null) parts.push({ mode: "rsvp", wpm: speeds.rsvp });
	return primary === "rsvp" ? parts.reverse() : parts;
}

export function modelSpeeds(model: SpeedModel): ChipSpeeds {
	const showReading = model.modesUsed.reading || !model.modesUsed.rsvp;
	return {
		reading: showReading ? model.reading.wpm : null,
		rsvp: model.rsvp?.wpm ?? null,
	};
}

/** Word share of each mode in the window, in whole percent; null unless both were read. */
export function modeMix(model: SpeedModel): { reading: number; rsvp: number } | null {
	const rsvpWords = model.rsvp?.words ?? 0;
	const total = model.reading.words + rsvpWords;
	if (model.reading.words <= 0 || rsvpWords <= 0) return null;
	const reading = Math.round((model.reading.words / total) * 100);
	return { reading, rsvp: 100 - reading };
}

export const WINDOW_LABELS: Record<SpeedWindow, string> = {
	recent: "Last 10h",
	"30d": "30 days",
	all: "All time",
};
