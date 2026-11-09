import { describe, expect, it } from "vitest";
import {
	dayBandOf,
	fastestTimeOfDay,
	fatiguePoint,
	INSIGHT_MIN_ACTIVE_MS,
	type InsightRow,
	lockedInsights,
	scrollVsPage,
	speedByFontSize,
	speedInsights,
} from "../insights";

const MIN = 60_000;

/** A local time on 2026-11-02 at `hour`, so day bands don't depend on the test machine's zone. */
function at(hour: number): number {
	return new Date(2026, 10, 2, hour, 0).getTime();
}

function row(over: Partial<InsightRow> & { wpm?: number } = {}): InsightRow {
	const durationMs = over.durationMs ?? 30 * MIN;
	const wpm = over.wpm ?? 250;
	return {
		mode: over.mode ?? "scroll",
		startedAt: over.startedAt ?? at(9),
		durationMs,
		wordsRead: over.wordsRead ?? Math.round((durationMs / MIN) * wpm),
		fontSize: over.fontSize === undefined ? 18 : over.fontSize,
		segmentWpm: over.segmentWpm ?? null,
	};
}

describe("scrollVsPage", () => {
	it("is null until both modes have 30 minutes", () => {
		const short = INSIGHT_MIN_ACTIVE_MS - MIN;
		expect(
			scrollVsPage([row({ mode: "scroll" }), row({ mode: "page", durationMs: short })]),
		).toBeNull();
		expect(scrollVsPage([row({ mode: "scroll" })])).toBeNull();
	});

	it("names the faster mode and both speeds", () => {
		const insight = scrollVsPage([
			row({ mode: "scroll", wpm: 270 }),
			row({ mode: "page", wpm: 250 }),
		]);
		expect(insight).toMatchObject({ value: "Scroll +8%", sub: "270 vs 250 wpm" });
	});

	it("reads Even when the speeds match", () => {
		expect(scrollVsPage([row({ mode: "scroll" }), row({ mode: "page" })])?.value).toBe("Even");
	});
});

describe("fastestTimeOfDay", () => {
	it("bands hours into morning, afternoon, evening and night", () => {
		expect([5, 11, 12, 16, 17, 21, 22, 4].map((h) => dayBandOf(at(h)))).toEqual([
			"morning",
			"morning",
			"afternoon",
			"afternoon",
			"evening",
			"evening",
			"night",
			"night",
		]);
	});

	it("is null under three sittings or with one band of 30 minutes", () => {
		expect(fastestTimeOfDay([row({ startedAt: at(9) }), row({ startedAt: at(19) })])).toBeNull();
		expect(
			fastestTimeOfDay([
				row({ startedAt: at(9) }),
				row({ startedAt: at(10) }),
				row({ startedAt: at(19), durationMs: 20 * MIN }),
			]),
		).toBeNull();
	});

	it("names the fastest band against all qualifying bands", () => {
		const insight = fastestTimeOfDay([
			row({ startedAt: at(9), wpm: 200 }),
			row({ startedAt: at(10), wpm: 200 }),
			row({ startedAt: at(19), wpm: 300 }),
		]);
		// 300 against (200 * 60 + 300 * 30) / 90 = 233.
		expect(insight).toMatchObject({ value: "Evening", sub: "+29% · 300 wpm" });
	});
});

describe("speedByFontSize", () => {
	it("is null with one size, and ignores rows without one", () => {
		expect(speedByFontSize([row({ fontSize: 18 }), row({ fontSize: 18 })], "reading")).toBeNull();
		expect(speedByFontSize([row({ fontSize: 18 }), row({ fontSize: null })], "reading")).toBeNull();
	});

	it("names the fastest size, as word size on RSVP", () => {
		const rows = [row({ fontSize: 16, wpm: 230 }), row({ fontSize: 20, wpm: 270 })];
		expect(speedByFontSize(rows, "reading")).toMatchObject({
			label: "Best size",
			value: "20 px",
			sub: "+8% · 270 wpm",
		});
		expect(speedByFontSize(rows, "rsvp")?.label).toBe("Best word size");
	});
});

describe("fatiguePoint", () => {
	const steady = [300, 300, 300, 300];
	it("is null under three sittings with three segments", () => {
		expect(fatiguePoint([row({ segmentWpm: steady }), row({ segmentWpm: steady })])).toBeNull();
		expect(
			fatiguePoint([
				row({ segmentWpm: steady }),
				row({ segmentWpm: steady }),
				row({ segmentWpm: [300, 300] }),
			]),
		).toBeNull();
	});

	it("finds the first segment that drops below the opening pace", () => {
		const tiring = [300, 300, 290, 270, 250];
		const insight = fatiguePoint([
			row({ segmentWpm: tiring }),
			row({ segmentWpm: tiring.map((w) => w - 100) }),
			row({ segmentWpm: tiring }),
		]);
		// Segment 3 (30-40m) is the first at or under 92% of the opening pace.
		expect(insight).toMatchObject({ label: "Slows after", value: "30m" });
		expect(insight?.sub).toMatch(/^−\d+%$/);
	});

	it("reports how far a steady reader holds pace", () => {
		const insight = fatiguePoint([
			row({ segmentWpm: steady }),
			row({ segmentWpm: steady }),
			row({ segmentWpm: steady }),
		]);
		expect(insight).toMatchObject({ value: "None", sub: "Steady to 40m" });
	});
});

describe("speedInsights", () => {
	it("keeps each view to its own sittings", () => {
		const rows = [
			row({ mode: "scroll", wpm: 270 }),
			row({ mode: "page", wpm: 250 }),
			row({ mode: "rsvp", fontSize: 32 }),
		];
		expect(speedInsights(rows, "reading").map((i) => i.id)).toEqual(["scroll-vs-page"]);
		expect(speedInsights(rows, "rsvp")).toEqual([]);
	});
});

describe("lockedInsights", () => {
	const ids = (rows: InsightRow[]) => {
		const unlocked = speedInsights(rows, "reading");
		return lockedInsights(rows, "reading", unlocked);
	};

	it("lists every reading insight at zero progress with no reading", () => {
		const locked = ids([]);
		expect(locked.map((l) => l.id)).toEqual([
			"time-of-day",
			"scroll-vs-page",
			"fatigue",
			"font-size",
		]);
		for (const l of locked) expect(l.progress).toBe(0);
		expect(locked[0].progressLabel).toBe("0 of 60 min");
	});

	it("counts partial minutes toward the 30-minute groups", () => {
		const locked = ids([row({ durationMs: 18 * MIN })]);
		const timeOfDay = locked.find((l) => l.id === "time-of-day");
		expect(timeOfDay?.progressLabel).toBe("18 of 60 min");
		expect(timeOfDay?.progress).toBeCloseTo(18 / 60);
		expect(timeOfDay?.need).toBe("30 min at two times of day, 3 sittings");
		expect(locked.find((l) => l.id === "scroll-vs-page")?.progressLabel).toBe(
			"scroll 18, page 0 of 30 min",
		);
	});

	it("caps a group at 30 minutes, so one long group is half way", () => {
		const fontSize = ids([row({ durationMs: 90 * MIN })]).find((l) => l.id === "font-size");
		expect(fontSize?.progress).toBe(0.5);
	});

	it("drops an insight once it unlocks", () => {
		const two = [row({ startedAt: at(9) }), row({ startedAt: at(19), wpm: 300 })];
		const waiting = ids(two).find((l) => l.id === "time-of-day");
		expect(waiting?.progressLabel).toBe("60 of 60 min · 2 of 3 sittings");
		expect(waiting?.progress).toBeCloseTo(2 / 3);
		const three = [...two, row({ startedAt: at(10) })];
		expect(ids(three).map((l) => l.id)).not.toContain("time-of-day");
	});

	it("counts long sittings toward fatigue and leaves out scroll-vs-page for RSVP", () => {
		const rows = [row({ mode: "rsvp", segmentWpm: [300, 300, 300] })];
		const locked = lockedInsights(rows, "rsvp", speedInsights(rows, "rsvp"));
		expect(locked.map((l) => l.id)).not.toContain("scroll-vs-page");
		expect(locked.find((l) => l.id === "fatigue")?.progressLabel).toBe("1 of 3");
	});
});
