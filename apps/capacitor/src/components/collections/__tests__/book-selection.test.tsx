import type React from "react";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { click, type Rendered, render } from "../../../test/render";

vi.mock("virtua", () => ({
	Virtualizer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../book-cover", () => ({ default: () => null }));

const { BookSelection } = await import("../book-selection");

// "Recent" sorts newest first, so b1 is the top row.
const library = [
	makeBook({ id: "b1", title: "Dune", author: "Frank Herbert", addedAt: 5 }),
	makeBook({ id: "b2", title: "Emma", author: "Jane Austen", addedAt: 4 }),
	makeBook({ id: "b3", title: "Ulysses", author: "James Joyce", addedAt: 3 }),
	makeBook({ id: "b4", title: "Persuasion", author: "Jane Austen", addedAt: 2 }),
];

let view: Rendered | undefined;
let picks: string[] = [];
afterEach(() => {
	view?.unmount();
	view = undefined;
	picks = [];
});

const Harness: React.FC<Partial<React.ComponentProps<typeof BookSelection>>> = (props) => {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	return (
		<BookSelection
			books={library}
			selected={selected}
			onSelectedChange={(next) => {
				picks = [...next];
				setSelected(next);
			}}
			{...props}
		/>
	);
};

const row = (id: string) =>
	view?.container.querySelector(`[data-book-id="${id}"]`) as HTMLButtonElement;
const rowIds = () =>
	[...(view?.container.querySelectorAll("[data-book-id]") ?? [])].map((el) =>
		el.getAttribute("data-book-id"),
	);

function typeSearch(value: string) {
	const input = view?.container.querySelector("input[type=search]") as HTMLInputElement;
	act(() => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

async function shiftClick(el: HTMLElement) {
	await act(async () => {
		el.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
	});
}

describe("BookSelection", () => {
	it("searches title and author, and keeps picks across searches", async () => {
		view = await render(<Harness />);
		expect(rowIds()).toEqual(["b1", "b2", "b3", "b4"]);
		await click(row("b1"));
		typeSearch("austen");
		expect(rowIds()).toEqual(["b2", "b4"]);
		await click(row("b4"));
		typeSearch("");
		expect(picks).toEqual(["b1", "b4"]);
		expect(row("b1").getAttribute("aria-pressed")).toBe("true");
		expect(row("b3").getAttribute("aria-pressed")).toBe("false");
	});

	it("filters by the Picked chip and by the caller's quick filters", async () => {
		view = await render(
			<Harness
				quickFilters={[{ id: "jane", label: "Jane", matches: (b) => b.author === "Jane Austen" }]}
			/>,
		);
		await click(row("b3"));
		await click(view.getButton("Picked · 1"));
		expect(rowIds()).toEqual(["b3"]);
		await click(view.getButton("Jane"));
		expect(rowIds()).toEqual(["b2", "b4"]);
		await click(view.getButton("All"));
		expect(rowIds()).toHaveLength(4);
	});

	it("shows locked books ticked with their label, and never picks them", async () => {
		view = await render(<Harness lockedIds={new Set(["b2"])} lockedLabel="In Classics" />);
		const locked = row("b2");
		expect(locked.disabled).toBe(true);
		expect(locked.getAttribute("aria-pressed")).toBe("true");
		expect(locked.textContent).toContain("In Classics");
		await click(row("b1"));
		await shiftClick(row("b3"));
		expect(picks).toEqual(["b1", "b3"]);
	});

	it("picks a range with Shift-click and unpicks one the same way", async () => {
		view = await render(<Harness />);
		await click(row("b4"));
		await shiftClick(row("b2"));
		expect(picks).toEqual(["b4", "b3", "b2"]);
		await click(row("b3"));
		await shiftClick(row("b4"));
		expect(picks).toEqual(["b2"]);
	});

	it("toggles the focused row with x", async () => {
		view = await render(<Harness />);
		await act(async () => {
			row("b3").dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
		});
		expect(picks).toEqual(["b3"]);
		await act(async () => {
			row("b3").dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
		});
		expect(picks).toEqual([]);
	});

	it("numbers picks in pick order when asked", async () => {
		view = await render(<Harness showOrder />);
		await click(row("b3"));
		await click(row("b1"));
		expect(row("b3").textContent).toContain("#1");
		expect(row("b1").textContent).toContain("#2");
		await click(row("b3"));
		expect(row("b1").textContent).toContain("#1");
	});
});
