import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsSpeedModel: () => ({ data: { pace: { wpm: 200, source: "measured" }, books: {} } }),
	},
}));

const { SeriesReadingTime } = await import("../series-reading-time");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("SeriesReadingTime", () => {
	it("shows total and remaining time across the chapters at the pace", async () => {
		view = await render(
			<SeriesReadingTime
				chapters={[
					{ wordCount: 6000, wordPosition: 6000, finishedAt: 1 },
					{ wordCount: 12_000, wordPosition: 0, finishedAt: null },
					{ wordCount: 0, wordPosition: 0, finishedAt: null },
				]}
			/>,
		);
		expect(view.text()).toBe("· Total 1h 30m· Left 1h");
		expect(view.queryButton("About these times")).not.toBeNull();
	});

	it("drops the time left once every known chapter is read", async () => {
		view = await render(
			<SeriesReadingTime chapters={[{ wordCount: 6000, wordPosition: 6000, finishedAt: 1 }]} />,
		);
		expect(view.text()).toBe("· Total 30 min");
	});

	it("shows nothing while no chapter has a known length", async () => {
		view = await render(
			<SeriesReadingTime chapters={[{ wordCount: 0, wordPosition: 0, finishedAt: null }]} />,
		);
		expect(view.text()).toBe("");
	});
});
