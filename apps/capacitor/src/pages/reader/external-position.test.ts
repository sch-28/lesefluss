import { describe, expect, it } from "vitest";
import { clampWord, decideExternalPosition, type ExternalPositionState } from "./external-position";

const idle: ExternalPositionState = {
	seenRev: 1000,
	isOwnRevision: () => false,
	ourWord: 100,
	hasLocalMove: false,
	isRsvpPlaying: false,
	isReadAloudPlaying: false,
	isSkippedForPlaybackSave: false,
};
const theirs = { wordPosition: 400, updatedAt: 2000 };

describe("decideExternalPosition", () => {
	it.each([
		["no row", null, idle, "ignore"],
		["a row older than seen", { ...theirs, updatedAt: 900 }, idle, "ignore"],
		["a row at the seen revision", { ...theirs, updatedAt: 1000 }, idle, "ignore"],
		[
			"this device's own write",
			theirs,
			{ ...idle, isOwnRevision: (rev: number) => rev === 2000 },
			"advance",
		],
		[
			"the word the reader is on",
			{ ...theirs, wordPosition: 100 },
			{ ...idle, hasLocalMove: true },
			"advance",
		],
		["an idle reader", theirs, idle, "adopt"],
		["a reader that moved", theirs, { ...idle, hasLocalMove: true }, "keep"],
		["RSVP playing", theirs, { ...idle, isRsvpPlaying: true }, "keep"],
		["the voice playing", theirs, { ...idle, isReadAloudPlaying: true }, "keep"],
		["a reader with no position yet", theirs, { ...idle, ourWord: null }, "adopt"],
		[
			"a pull skipped for the reader's playback save",
			theirs,
			{ ...idle, isSkippedForPlaybackSave: true },
			"keep",
		],
	] as const)("%s → %s", (_, row, state, expected) => {
		expect(decideExternalPosition(row, state)).toBe(expected);
	});

	it("compares no clocks: a local move keeps the reader's word however new the row", () => {
		const farFuture = { ...theirs, updatedAt: Number.MAX_SAFE_INTEGER };
		expect(decideExternalPosition(farFuture, { ...idle, hasLocalMove: true })).toBe("keep");
	});
});

describe("clampWord", () => {
	it("keeps a word from a longer copy of the book inside this one", () => {
		expect(clampWord(5000, 1000)).toBe(999);
		expect(clampWord(-3, 1000)).toBe(0);
		expect(clampWord(10, 0)).toBe(0);
	});
});
