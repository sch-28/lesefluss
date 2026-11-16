import { BookOpen, RotateCcw, Trash2 } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../../test/book-fixture";
import { flush, type Rendered, render } from "../../../../test/render";
import { BookActionsSheet } from "../book-actions-sheet";
import type { BookActionEntry } from "../use-book-actions";

const entry = (id: string, label: string, icon = BookOpen): BookActionEntry =>
	({ kind: "item", id, label, icon, onSelect: () => {} }) as BookActionEntry;

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.restoreAllMocks();
	document.body.innerHTML = "";
});

function pointer(kind: "fine" | "coarse") {
	vi.spyOn(window, "matchMedia").mockImplementation(
		(query) =>
			({
				matches: query === `(pointer: ${kind})`,
				addEventListener() {},
				removeEventListener() {},
			}) as unknown as MediaQueryList,
	);
}

const press = () =>
	window.dispatchEvent(
		new PointerEvent("pointerdown", { clientX: 200, clientY: 300, bubbles: true }),
	);

describe("BookActionsSheet", () => {
	it("sets Reset progress and Delete apart behind a divider", async () => {
		const entries = [
			entry("edit", "Edit"),
			entry("select", "Select"),
			entry("reset", "Reset progress", RotateCcw),
			entry("delete", "Delete", Trash2),
		];
		view = await render(
			<BookActionsSheet book={makeBook()} entries={entries} onClose={() => {}} />,
		);
		const rows = [...document.querySelectorAll("hr, button")].filter(
			(el) =>
				el.tagName === "HR" ||
				["Edit", "Select", "Reset progress", "Delete"].includes(el.textContent?.trim() ?? ""),
		);
		expect(rows.map((el) => (el.tagName === "HR" ? "---" : el.textContent?.trim()))).toEqual([
			"Edit",
			"Select",
			"---",
			"Reset progress",
			"Delete",
		]);
	});

	it("opens as a menu at the press with a mouse, never as a sheet", async () => {
		pointer("fine");
		press();
		const entries = [entry("edit", "Edit"), entry("delete", "Delete", Trash2)];
		view = await render(
			<BookActionsSheet book={makeBook()} entries={entries} onClose={() => {}} />,
		);
		await flush();
		const menu = document.querySelector('[data-testid="book-actions-menu"]');
		expect(menu).not.toBeNull();
		expect(document.querySelector('[data-testid="book-actions-sheet"]')).toBeNull();
		expect(
			[...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].map((el) => el.textContent),
		).toEqual(["Edit", "Delete"]);
		expect(menu?.querySelectorAll('[role="separator"]')).toHaveLength(2);
	});

	it("stays a sheet on touch", async () => {
		pointer("coarse");
		press();
		view = await render(
			<BookActionsSheet book={makeBook()} entries={[entry("edit", "Edit")]} onClose={() => {}} />,
		);
		await flush();
		expect(document.querySelector('[data-testid="book-actions-menu"]')).toBeNull();
		expect(document.querySelector('[data-testid="book-actions-sheet"]')).not.toBeNull();
	});
});
