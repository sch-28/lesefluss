import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PopoverSection } from "../../../components/selection-popover";
import { click, type Rendered, render } from "../../../test/render";
import { AllSeriesList } from "../all-series-list";
import type { SeriesEntry } from "../series-nav";

vi.mock("../../../components/selection-popover", () => ({
	default: ({
		trigger,
		sections,
	}: {
		trigger: React.ReactNode;
		sections: PopoverSection<string>[];
	}) => (
		<div>
			{trigger}
			{sections.flatMap((s) =>
				s.options.map((o) => (
					<button
						key={o}
						type="button"
						aria-label={`option ${s.labels[o]}`}
						onClick={() => s.onSelect(o)}
					>
						{s.labels[o]}
					</button>
				)),
			)}
		</div>
	),
}));

function entry(over: Partial<SeriesEntry> & Pick<SeriesEntry, "id" | "name">): SeriesEntry {
	return {
		kind: "book",
		author: null,
		count: 1,
		started: 0,
		finished: 0,
		lastRead: null,
		coverBookIds: [],
		coverImage: null,
		...over,
	};
}

// Last read order interleaves the kinds, so the grouped order differs from it.
const ENTRIES = [
	entry({ kind: "serial", id: "worm", name: "Worm", count: 50, lastRead: 300 }),
	entry({ id: "earth", name: "Earthsea", count: 2, lastRead: 200 }),
	entry({ kind: "serial", id: "wn", name: "Wandering Inn", count: 40, lastRead: 100 }),
	entry({ id: "dune", name: "Dune", count: 6 }),
];

let view: Rendered | undefined;
afterEach(() => view?.unmount());

async function renderList(onPick = vi.fn(), onExit = vi.fn()) {
	view = await render(
		<AllSeriesList entries={ENTRIES} covers={new Map()} onPick={onPick} onExit={onExit} />,
	);
	return { view, onPick, onExit };
}

const input = () => view?.container.querySelector("input") as HTMLInputElement;
const rows = () => [
	...(view?.container.querySelectorAll<HTMLButtonElement>("button[data-series-row]") ?? []),
];
const rowNames = () => rows().map((r) => r.querySelector(".font-medium")?.textContent);
const headers = () => [...(view?.container.querySelectorAll("h2") ?? [])].map((h) => h.textContent);

function key(el: HTMLElement, k: string) {
	act(() => {
		el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
	});
}

async function type(value: string) {
	const el = input();
	await act(async () => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(el, value);
		el.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

describe("AllSeriesList", () => {
	it("groups book series before serials, each in last-read order, with counts", async () => {
		await renderList();
		expect(headers()).toEqual(["Book series", "Serials"]);
		expect(rowNames()).toEqual(["Earthsea", "Dune", "Worm", "Wandering Inn"]);
		const counts = [...(view?.container.querySelectorAll("section") ?? [])].map(
			(s) => s.querySelectorAll("button[data-series-row]").length,
		);
		expect(counts).toEqual([2, 2]);
		expect(view?.text()).toContain("Book series2");
		expect(view?.text()).toContain("Serials2");
	});

	it("re-sorts inside each group from the sort menu", async () => {
		await renderList();
		await click(view?.getButton("option A–Z") as HTMLButtonElement);
		expect(rowNames()).toEqual(["Dune", "Earthsea", "Wandering Inn", "Worm"]);
		await click(view?.getButton("option Size") as HTMLButtonElement);
		expect(rowNames()).toEqual(["Dune", "Earthsea", "Worm", "Wandering Inn"]);
		expect(view?.queryButton(/^Sort: Size/)).not.toBeNull();
		await click(view?.getButton("option Last read") as HTMLButtonElement);
		expect(rowNames()).toEqual(["Earthsea", "Dune", "Worm", "Wandering Inn"]);
		expect(view?.queryButton(/^Sort: Last read/)).not.toBeNull();
	});

	it("hides a group the search leaves empty and shows the filtered count", async () => {
		await renderList();
		await type("w");
		expect(headers()).toEqual(["Serials"]);
		expect(rowNames()).toEqual(["Worm", "Wandering Inn"]);
		expect(view?.container.querySelector("[data-testid=all-series-count]")?.textContent).toBe(
			"2 of 4",
		);
		await type("zzz");
		expect(headers()).toEqual([]);
		expect(view?.text()).toContain("No series match.");
	});

	it("opens the first row in grouped order on Enter", async () => {
		const { onPick } = await renderList();
		key(input(), "Enter");
		expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "earth" }));
		await type("in");
		key(input(), "Enter");
		expect(onPick).toHaveBeenLastCalledWith(expect.objectContaining({ id: "wn" }));
	});

	it("moves through the rows across groups with the arrow keys and back to the search", async () => {
		await renderList();
		input().focus();
		key(input(), "ArrowDown");
		expect(document.activeElement).toBe(rows()[0]);
		key(rows()[0] as HTMLElement, "ArrowDown");
		key(rows()[1] as HTMLElement, "ArrowDown");
		expect(document.activeElement).toBe(rows()[2]);
		expect(document.activeElement?.textContent).toContain("Worm");
		key(rows()[2] as HTMLElement, "ArrowUp");
		key(rows()[1] as HTMLElement, "ArrowUp");
		key(rows()[0] as HTMLElement, "ArrowUp");
		expect(document.activeElement).toBe(input());
	});

	it("clears the search on Esc, then leaves", async () => {
		const { onExit } = await renderList();
		await type("dune");
		key(input(), "Escape");
		expect(input().value).toBe("");
		expect(onExit).not.toHaveBeenCalled();
		key(input(), "Escape");
		expect(onExit).toHaveBeenCalledOnce();
	});

	it("on a row, Esc clears the search and returns to it, then leaves", async () => {
		const { onExit } = await renderList();
		await type("dune");
		rows()[0]?.focus();
		key(rows()[0] as HTMLElement, "Escape");
		expect(input().value).toBe("");
		expect(document.activeElement).toBe(input());
		key(rows()[0] as HTMLElement, "Escape");
		expect(onExit).toHaveBeenCalledOnce();
	});

	it("keeps the controls and reserves the list while loading", async () => {
		view = await render(
			<AllSeriesList entries={[]} covers={new Map()} onPick={vi.fn()} isPending />,
		);
		expect(input()).not.toBeNull();
		expect(view.queryButton(/^Sort: /)).not.toBeNull();
		expect(view.container.querySelector("[data-testid=reserved-card]")).not.toBeNull();
		expect(view.text()).not.toContain("No series match.");
	});
});
