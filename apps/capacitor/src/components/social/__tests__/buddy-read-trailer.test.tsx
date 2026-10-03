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

const { BuddyReadTrailer, MIN_GAP, trailerPositions } = await import("../buddy-read-trailer");

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
		for (const percent of labels()) expect(Math.abs(percent - 47)).toBeGreaterThanOrEqual(MIN_GAP);
	});

	it("keeps everyone clear of each other on every tick, wherever You are", () => {
		for (let self = 0; self <= 100; self++) {
			for (let tick = 0; tick <= 15; tick++) {
				const positions = trailerPositions(self, tick);
				expect(positions.readers).toHaveLength(3);
				const riders = [positions.self, ...positions.readers]
					.map((r) => r.percent)
					.sort((a, b) => a - b);
				expect(riders[0]).toBeGreaterThanOrEqual(0);
				expect(riders.at(-1)).toBeLessThanOrEqual(100);
				for (let i = 1; i < riders.length; i++) {
					expect(riders[i] - riders[i - 1]).toBeGreaterThanOrEqual(MIN_GAP);
				}
			}
			expect(trailerPositions(self, 15).self.percent).toBe(self);
		}
	});

	it("moves each reader on its own ticks", () => {
		const moversPerTick = Array.from({ length: 15 }, (_, i) => {
			const before = trailerPositions(50, i).readers;
			const after = trailerPositions(50, i + 1).readers;
			return after.filter((r, j) => r.percent !== before[j]?.percent).length;
		});
		expect(moversPerTick.some((n) => n > 0 && n < 3)).toBe(true);
		const start = trailerPositions(50, 0).readers;
		const end = trailerPositions(50, 15).readers;
		for (const [i, r] of end.entries())
			expect(r.percent - (start[i]?.percent ?? 0)).toBeGreaterThanOrEqual(12);
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
