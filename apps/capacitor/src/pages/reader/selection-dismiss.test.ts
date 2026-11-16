import { describe, expect, it } from "vitest";
import { markerDetail } from "./buddy-read-markers";

describe("markerDetail", () => {
	const live = { userId: "u", wordPosition: 500, wordCount: 1000, wpm: 280, isListening: false };

	it("shows the word gap when positions compare exactly", () => {
		expect(markerDetail({ live, wordPosition: 500, goal: null }, 200, false)).toBe(
			"reading now · 280 wpm · 300 words ahead",
		);
		expect(markerDetail({ live: null, wordPosition: 100, goal: null }, 200, false)).toBe(
			"100 words behind",
		);
	});

	it("leaves the word gap out when positions are approximate", () => {
		expect(markerDetail({ live, wordPosition: 500, goal: null }, 200, true)).toBe(
			"reading now · 280 wpm",
		);
		expect(markerDetail({ live: null, wordPosition: 500, goal: null }, 200, true)).toBe("");
	});

	it("says a listener is listening, without a speed", () => {
		const listening = { ...live, wpm: null, isListening: true };
		expect(markerDetail({ live: listening, wordPosition: 500, goal: null }, 200, true)).toBe(
			"listening now",
		);
	});

	it("adds their standing against their own goal when it is shared", () => {
		expect(
			markerDetail({ live: null, wordPosition: 500, goal: { aheadDays: -1.26 } }, 500, false),
		).toBe("level with you · goal \u22121.3 d");
		expect(markerDetail({ live: null, wordPosition: 500, goal: { aheadDays: 2 } }, 500, true)).toBe(
			"goal +2.0 d",
		);
	});
});
