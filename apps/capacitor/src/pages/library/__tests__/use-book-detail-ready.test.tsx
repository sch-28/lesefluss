import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../../../services/db/schema";
import { makeBook } from "../../../test/book-fixture";
import { type Rendered, render } from "../../../test/render";

const loading = {
	goalPlan: false,
	stats: false,
	content: false,
	speedModel: false,
	settings: false,
	dailyReading: false,
};
const goalPlanCalls: (string | null)[] = [];

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		// A disabled or offline-paused query is pending but not loading: it never fetches.
		useReadingGoalPlan: (bookId: string | null) => {
			goalPlanCalls.push(bookId);
			return { isPending: true, isLoading: bookId !== null && loading.goalPlan };
		},
		useStatsBook: () => ({ isPending: true, isLoading: loading.stats }),
		useBookContent: () => ({ isPending: true, isLoading: loading.content }),
		useStatsSpeedModel: () => ({ isPending: true, isLoading: loading.speedModel }),
		useSettings: () => ({ isPending: true, isLoading: loading.settings }),
		useStatsDailyReading: () => ({ isPending: true, isLoading: loading.dailyReading }),
	},
}));

const { useBookDetailReady } = await import("../use-book-detail-ready");

function Probe({ book }: { book: Book | null | undefined }) {
	return <p>{useBookDetailReady(book) ? "ready" : "waiting"}</p>;
}

let rendered: Rendered | undefined;

beforeEach(() => {
	Object.assign(loading, {
		goalPlan: false,
		stats: false,
		content: false,
		speedModel: false,
		settings: false,
		dailyReading: false,
	});
	goalPlanCalls.length = 0;
});

afterEach(() => {
	rendered?.unmount();
	rendered = undefined;
});

describe("useBookDetailReady", () => {
	it.each([
		"goalPlan",
		"stats",
		"content",
		"speedModel",
		"settings",
		"dailyReading",
	] as const)("holds the page while %s is still loading", async (key) => {
		loading[key] = true;
		rendered = await render(<Probe book={makeBook({ id: "b1" })} />);
		expect(rendered.text()).toBe("waiting");

		loading[key] = false;
		await rendered.rerender(<Probe book={makeBook({ id: "b1" })} />);
		expect(rendered.text()).toBe("ready");
	});

	it("does not wait for a goal on a serial chapter, which cannot have one", async () => {
		loading.goalPlan = true;
		rendered = await render(<Probe book={makeBook({ id: "c1", seriesId: "s1" })} />);
		expect(goalPlanCalls.at(-1)).toBeNull();
		expect(rendered.text()).toBe("ready");
	});

	it("does not wait for queries paused offline, which are pending but never fetch", async () => {
		rendered = await render(<Probe book={makeBook({ id: "b1" })} />);
		expect(rendered.text()).toBe("ready");
	});

	it("is not ready without a book", async () => {
		rendered = await render(<Probe book={undefined} />);
		expect(rendered.text()).toBe("waiting");
	});

	it("stays ready when a card's query goes pending again after the page showed", async () => {
		rendered = await render(<Probe book={makeBook({ id: "b1" })} />);
		expect(rendered.text()).toBe("ready");

		loading.goalPlan = true;
		await rendered.rerender(<Probe book={makeBook({ id: "b1" })} />);
		expect(rendered.text()).toBe("ready");
	});

	it("waits again for another book's data", async () => {
		rendered = await render(<Probe book={makeBook({ id: "b1" })} />);
		expect(rendered.text()).toBe("ready");

		loading.stats = true;
		await rendered.rerender(<Probe book={makeBook({ id: "b2" })} />);
		expect(rendered.text()).toBe("waiting");
	});
});
