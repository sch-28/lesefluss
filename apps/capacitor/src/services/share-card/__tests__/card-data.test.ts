import { computeSpeedModel } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { finishedCardData } from "../card-data";

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = new Date(2026, 10, 1, 20).getTime();
const book = {
	title: "Morning Star",
	author: "Pierce Brown",
	coverImage: null,
	wordCount: 176_000,
	finishedAt: new Date(2026, 10, 18, 22).getTime(),
};

const sitting = (day: number, mode: "scroll" | "rsvp", minutes: number, wpm: number) => ({
	mode,
	startedAt: T0 + day * DAY,
	durationMs: minutes * MIN,
	wordsRead: minutes * wpm,
});

describe("finishedCardData", () => {
	it("a reader's finished book: time, wpm, days and words", () => {
		const card = finishedCardData({
			book,
			sessions: [
				sitting(0, "scroll", 60, 250),
				sitting(0, "scroll", 30, 250),
				sitting(2, "scroll", 90, 250),
			],
			model: undefined,
		});
		expect(card.kind).toBe("book");
		if (card.kind !== "book") return;
		expect(card.kicker).toBe("Finished · Nov 2026");
		expect(card.tiles.map((t) => [t.label, t.value])).toEqual([
			["Time", "3h"],
			["wpm", "250"],
			["Days", "2"],
			["Words", "176k"],
		]);
	});

	it("an RSVP book: both speeds and the time RSVP saved against the reader's own speed", () => {
		const now = T0;
		const model = computeSpeedModel([sitting(-5, "scroll", 120, 200)], { now });
		const card = finishedCardData({
			book,
			sessions: [sitting(0, "rsvp", 60, 400), sitting(1, "scroll", 30, 220)],
			model,
		});
		if (card.kind !== "book") throw new Error("book card expected");
		expect(card.tiles.map((t) => [t.label, t.value])).toEqual([
			["Time", "1h 30m"],
			["RSVP wpm", "400"],
			["Reading wpm", "220"],
			["Days", "2"],
			// 24,000 RSVP words at 200 wpm take 2h, at 400 wpm 1h.
			["Saved by RSVP", "1h"],
		]);
		expect(card.tiles.at(-1)).toMatchObject({ hot: true, wide: true });
	});
});
