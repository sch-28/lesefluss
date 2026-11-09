import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../../test/render";

const state = {
	trend: { data: undefined } as { data: unknown },
};

vi.mock("../../../../services/db/hooks", () => ({
	queryHooks: { useStatsWpmTrend: () => state.trend },
}));

const { WpmTrend, firstShownBucket, trendAxisLegend, wpmAxisDomain } = await import("../wpm-trend");

const DAY = 86_400_000;

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

function trend(wpms: number[], tests: unknown[] = [], rsvpTarget = 0) {
	return {
		data: {
			granularity: "day",
			averages: { measured: 0, rsvpTarget },
			measured: wpms.map((avgWpm, i) => ({ bucketStart: i * DAY, avgWpm })),
			tests,
		},
	};
}

async function show(now = DAY * 30) {
	view = await render(<WpmTrend window="30d" mode="reading" windowLabel="30 days" now={now} />);
	return view.container;
}

describe("WpmTrend", () => {
	it("reserves the chart's height while the trend loads", async () => {
		state.trend = { data: undefined };
		const container = await show();
		expect(container.querySelector("[data-testid=wpm-trend-loading] svg")).not.toBeNull();
	});

	it("says there is no trend yet with no reading and no test", async () => {
		state.trend = trend([0, 0]);
		expect((await show()).textContent).toContain("Not enough reading");
	});

	it("starts the x-axis at the first bucket with reading", async () => {
		state.trend = trend([0, 0, 0, 220, 240]);
		const container = await show();
		const ticks = [...container.querySelectorAll("[data-testid=wpm-trend-tick]")];
		expect(ticks[0]?.getAttribute("x")).toBe("30");
		expect(ticks[0]?.getAttribute("text-anchor")).toBe("start");
		expect(ticks.at(-1)?.getAttribute("text-anchor")).toBe("end");
		expect(container.querySelectorAll("circle.fill-primary").length).toBe(3);
	});

	it("draws the average reader only when it falls inside the data's axis", async () => {
		state.trend = trend([220, 240]);
		expect((await show()).querySelector("[data-testid=wpm-trend-avg]")).not.toBeNull();
		view?.unmount();
		state.trend = trend([400, 420]);
		expect((await show()).querySelector("[data-testid=wpm-trend-avg]")).toBeNull();
	});

	it("marks a speed test even with no reading and labels only the latest", async () => {
		state.trend = trend(
			[0, 250, 260],
			[
				{ bucketIndex: 2, wpm: 410, takenAt: DAY * 2 + 1 },
				{ bucketIndex: 2, wpm: 520, takenAt: DAY * 2 + 2 },
			],
		);
		const container = await show(DAY * 5);
		expect(container.querySelectorAll("[data-testid=wpm-trend-test]")).toHaveLength(2);
		const labels = [...container.querySelectorAll("[data-testid=wpm-trend-test] text")];
		expect(labels).toHaveLength(1);
		expect(labels[0]?.textContent).toContain("520");
		expect(container.textContent).toContain("Speed test");
	});
});

describe("wpmAxisDomain", () => {
	it("starts at the data, not at zero, in three even steps", () => {
		expect(wpmAxisDomain([218, 0, 252])).toEqual({ min: 200, max: 260, step: 20 });
		expect(wpmAxisDomain([225, 400, 310])).toEqual({ min: 200, max: 500, step: 100 });
	});

	it("covers a single value and an empty trend", () => {
		const one = wpmAxisDomain([250]);
		expect(one.min).toBeLessThanOrEqual(250);
		expect(one.max).toBeGreaterThan(one.min);
		expect(wpmAxisDomain([])).toEqual({ min: 0, max: 300, step: 100 });
	});
});

describe("firstShownBucket", () => {
	it("is the first bucket with reading or a test", () => {
		const points = [0, 0, 240, 250].map((avgWpm) => ({ avgWpm }));
		expect(firstShownBucket(points, [])).toBe(2);
		expect(firstShownBucket(points, [{ bucketIndex: 1, wpm: 300, takenAt: 0 }])).toBe(1);
		expect(firstShownBucket([{ avgWpm: 0 }], [])).toBe(0);
	});
});

describe("trendAxisLegend", () => {
	it("names the window and the dates the chart spans", () => {
		const oct20 = new Date(2026, 9, 20).getTime();
		const nov2 = new Date(2026, 10, 2).getTime();
		expect(trendAxisLegend("Last 10h", [oct20, nov2])).toMatch(
			/^Last 10h · 20 Oct – 2 Nov$|^Last 10h · Oct 20 – Nov 2$/,
		);
		expect(trendAxisLegend("Last 10h", [nov2])).toMatch(/^Last 10h · (2 Nov|Nov 2)$/);
		expect(trendAxisLegend("All time", [])).toBe("All time");
	});
});
