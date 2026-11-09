import { BookOpen, RotateCcw, Trash2 } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { makeBook } from "../../../../test/book-fixture";
import { type Rendered, render } from "../../../../test/render";
import { BookActionsSheet } from "../book-actions-sheet";
import type { BookActionEntry } from "../use-book-actions";

const entry = (id: string, label: string, icon = BookOpen): BookActionEntry =>
	({ kind: "item", id, label, icon, onSelect: () => {} }) as BookActionEntry;

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

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
});
