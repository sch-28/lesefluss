import { BUDDY_TRAILER_MIN_GAP } from "@lesefluss/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const reading = vi.hoisted(() => ({ current: [] as Record<string, unknown>[] }));

vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useBooks: () => ({ data: { books: reading.current, covers: new Map() } }),
	},
}));

const libraryBook = (over: Record<string, unknown>) => ({
	id: "b1",
	title: "Book",
	catalogId: null,
	wordCount: 100,
	wordPosition: 0,
	status: null,
	finishedAt: null,
	seriesId: null,
	hideFromProfile: false,
	lastRead: 1,
	...over,
});

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
		reading.current = [libraryBook({ title: "Morning Star", wordPosition: 47 })];
		view = await render(<BuddyReadTrailer self={{ name: "Ada", avatarUrl: null }} />);

		expect(view.text()).toContain("Morning Star");
		expect(view.text()).toContain("You · 47%");
		for (const percent of labels())
			expect(Math.abs(percent - 47)).toBeGreaterThanOrEqual(BUDDY_TRAILER_MIN_GAP);
	});

	it("never rides on a book set aside or hidden from the profile", async () => {
		mockReducedMotion(true);
		reading.current = [
			libraryBook({
				id: "d",
				title: "Dropped one",
				wordPosition: 40,
				status: "dropped",
				lastRead: 9,
			}),
			libraryBook({ id: "w", title: "Wanted one", wordPosition: 40, status: "want", lastRead: 8 }),
			libraryBook({
				id: "h",
				title: "Hidden one",
				wordPosition: 40,
				hideFromProfile: true,
				lastRead: 7,
			}),
			libraryBook({ id: "o", title: "Only opened", wordPosition: 0, lastRead: 6 }),
		];
		view = await render(<BuddyReadTrailer self={{ name: "Ada", avatarUrl: null }} />);

		expect(view.text()).toContain("Any book you like");
		expect(view.text()).not.toMatch(/Dropped one|Wanted one|Hidden one|Only opened/);
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
