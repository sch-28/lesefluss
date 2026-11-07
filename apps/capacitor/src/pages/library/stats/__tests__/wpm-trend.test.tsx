import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../../test/render";

type LineProps = {
	data: { data: unknown[] }[];
	yScale: { max: number };
	layers?: unknown[];
};

const state = {
	trend: { isLoading: true, data: undefined } as { isLoading: boolean; data: unknown },
	lines: [] as LineProps[],
};

vi.mock("../../../../contexts/theme-context", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../../../contexts/theme-context")>()),
	useTheme: () => ({ theme: "light", isEinkMode: false }),
}));
vi.mock("../../../../services/db/hooks", () => ({
	queryHooks: { useStatsWpmTrend: () => state.trend },
}));
vi.mock("@nivo/line", () => ({
	ResponsiveLine: (props: LineProps) => {
		state.lines.push(props);
		return null;
	},
}));

const { WpmTrend, wpmAxisMax } = await import("../wpm-trend");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	state.lines = [];
});

const loaded = {
	isLoading: false,
	data: {
		granularity: "day",
		averages: { measured: 300, rsvpTarget: 400 },
		measured: [
			{ bucketStart: 0, avgWpm: 280 },
			{ bucketStart: 86_400_000, avgWpm: 320 },
		],
	},
};

describe("WpmTrend", () => {
	it("never mounts the chart with an empty series while the trend loads", async () => {
		state.trend = { isLoading: true, data: undefined };
		view = await render(<WpmTrend window="30d" mode="reading" windowLabel="30 days" now={0} />);
		expect(state.lines).toHaveLength(0);
		expect(view.container.querySelector("[data-testid=wpm-trend-loading]")).not.toBeNull();
	});

	it("puts the axis top far enough over the target that its label stays on the plot", async () => {
		state.trend = loaded;
		view = await render(<WpmTrend window="30d" mode="reading" windowLabel="30 days" now={0} />);
		const last = state.lines.at(-1);
		expect(last?.data[0]?.data).toHaveLength(2);
		// 160px plot: the label's top sits about 19px over its line.
		expect(160 * (1 - 400 / (last?.yScale.max ?? 0))).toBeGreaterThan(20);
	});

	it("marks a speed test even with no reading, and lifts the axis over it", async () => {
		const DAY = 86_400_000;
		state.trend = {
			isLoading: false,
			data: {
				granularity: "day",
				averages: { measured: 0, rsvpTarget: 0 },
				measured: [
					{ bucketStart: 0, avgWpm: 0 },
					{ bucketStart: DAY, avgWpm: 0 },
				],
				tests: [{ bucketIndex: 1, wpm: 640, takenAt: DAY + 1 }],
			},
		};
		view = await render(
			<WpmTrend window="30d" mode="reading" windowLabel="30 days" now={DAY * 2} />,
		);
		const last = state.lines.at(-1);
		expect(last?.yScale.max).toBeGreaterThan(640);
		const layer = last?.layers?.find((l) => typeof l === "function") as
			| ((p: object) => React.ReactElement)
			| undefined;
		expect(layer).toBeDefined();
		const markers = await render(
			<svg role="img" aria-label="Test markers">
				{layer?.({
					xScale: (i: number) => i * 10,
					yScale: (w: number) => 1000 - w,
					innerHeight: 160,
				})}
			</svg>,
		);
		expect(markers.container.querySelectorAll("[data-testid=wpm-trend-test]")).toHaveLength(1);
		expect(markers.container.textContent).toContain("640");
		markers.unmount();
		expect(view.container.textContent).toContain("Speed test");
	});

	it("rounds the axis top to 50 with a fifth of headroom", () => {
		expect(wpmAxisMax([225, 400, 310])).toBe(500);
		expect(wpmAxisMax([225, 0])).toBe(300);
		expect(wpmAxisMax([])).toBe(50);
	});
});
