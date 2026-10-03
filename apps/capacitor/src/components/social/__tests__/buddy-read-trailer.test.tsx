import { BUDDY_TRAILER_MIN_GAP } from "@lesefluss/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const reading = vi.hoisted(() => ({
	current: [] as { id: string; title: string; percent: number }[],
}));

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useStatsCurrentlyReading: () => ({ data: reading.current }),
		useBooks: () => ({ data: undefined }),
	},
}));

const { BuddyReadTrailer } = await import("../buddy-read-trailer");

function mockReducedMotion(reduce: boolean) {
	vi.stubGlobal(
		"matchMedia",
		vi.fn((query: string) => ({
			matches: query.includes("reduce") ? reduce : false,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		})),
	);
}

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	reading.current = [];
	vi.unstubAllGlobals();
});

const labels = () =>
	[...(view?.container.querySelectorAll("span") ?? [])]
		.map((s) => s.textContent ?? "")
		.filter((t) => /^\d+%$/.test(t))
		.map((t) => Number.parseInt(t, 10));

describe("BuddyReadTrailer", () => {
	it("shows only the final frame under reduced motion, with no replay", async () => {
		mockReducedMotion(true);
		view = await render(<BuddyReadTrailer />);

		expect(view.text()).toContain("See where everyone is, live");
		expect(view.queryButton("Replay preview")).toBeNull();
	});

	it("starts at the first frame and falls back to a demo book", async () => {
		mockReducedMotion(false);
		view = await render(<BuddyReadTrailer />);

		expect(view.text()).toContain("Everyone reads their own copy");
		expect(view.text()).toContain("Any book you like");
		expect(view.text()).toContain("You · 26%");
	});

	it("rides on the reader's current book and keeps the illustrated readers clear of them", async () => {
		mockReducedMotion(true);
		reading.current = [{ id: "b1", title: "Morning Star", percent: 47 }];
		view = await render(<BuddyReadTrailer self={{ name: "Ada", avatarUrl: null }} />);

		expect(view.text()).toContain("Morning Star");
		expect(view.text()).toContain("You · 47%");
		for (const percent of labels())
			expect(Math.abs(percent - 47)).toBeGreaterThanOrEqual(BUDDY_TRAILER_MIN_GAP);
	});

	it("tells screen readers what the illustration shows in one sentence", async () => {
		mockReducedMotion(true);
		view = await render(<BuddyReadTrailer />);

		const sr = view.container.querySelector(".sr-only");
		expect(sr?.textContent).toMatch(/Preview of a buddy read/);
		const walker = document.createTreeWalker(view.container, NodeFilter.SHOW_TEXT);
		const exposed: string[] = [];
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const parent = node.parentElement;
			if (node.textContent?.trim() && !parent?.closest('[aria-hidden="true"], .sr-only')) {
				exposed.push(node.textContent);
			}
		}
		expect(exposed).toEqual([]);
	});
});
