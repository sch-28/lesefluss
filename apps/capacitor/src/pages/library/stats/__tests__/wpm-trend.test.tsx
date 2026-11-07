import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../../test/render";

type LineProps = { data: { data: unknown[] }[]; yScale: { max: number } };

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
		view = await render(<WpmTrend period="7d" periodLabel="Last 7 days" now={0} />);
		expect(state.lines).toHaveLength(0);
		expect(view.container.querySelector("[data-testid=wpm-trend-loading]")).not.toBeNull();
	});

	it("puts the axis top far enough over the target that its label stays on the plot", async () => {
		state.trend = loaded;
		view = await render(<WpmTrend period="7d" periodLabel="Last 7 days" now={0} />);
		const last = state.lines.at(-1);
		expect(last?.data[0]?.data).toHaveLength(2);
		// 160px plot: the label's top sits about 19px over its line.
		expect(160 * (1 - 400 / (last?.yScale.max ?? 0))).toBeGreaterThan(20);
	});

	it("rounds the axis top to 50 with a fifth of headroom", () => {
		expect(wpmAxisMax([225, 400, 310])).toBe(500);
		expect(wpmAxisMax([225, 0])).toBe(300);
		expect(wpmAxisMax([])).toBe(50);
	});
});
