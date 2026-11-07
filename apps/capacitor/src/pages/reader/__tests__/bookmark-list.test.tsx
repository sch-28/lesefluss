import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import { formatShortDate } from "../../../utils/date-utils";
import BookmarkList, { type BookmarkRow } from "../bookmark-list";

const CREATED = Date.UTC(2026, 4, 3, 12);

function row(overrides: Partial<BookmarkRow> = {}): BookmarkRow {
	return {
		id: "a",
		word: 120,
		label: null,
		createdAt: CREATED,
		chapterTitle: "Chapter 2",
		percent: 40,
		firstLine: "The river bent slowly around the old mill",
		...overrides,
	};
}

let rendered: Rendered;
afterEach(() => rendered.unmount());

function setInputValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("BookmarkList", () => {
	it("shows the empty state without bookmarks", async () => {
		rendered = await render(
			<BookmarkList rows={[]} currentId={null} onJump={vi.fn()} onRename={vi.fn()} />,
		);
		expect(rendered.text()).toBe("No bookmarks yet. Press B or tap the ribbon to mark this page.");
	});

	it("shows chapter, percent, date, label and first line, and jumps to the word on tap", async () => {
		const onJump = vi.fn();
		rendered = await render(
			<BookmarkList
				rows={[
					row(),
					row({ id: "b", word: 300, label: "Big reveal", chapterTitle: null, percent: 90 }),
				]}
				currentId="a"
				onJump={onJump}
				onRename={vi.fn()}
			/>,
		);
		const items = [...rendered.container.querySelectorAll("li")].map((li) => li.textContent);
		expect(items).toEqual([
			`Chapter 2 · 40% · ${formatShortDate(CREATED)}The river bent slowly around the old mill`,
			`90% · ${formatShortDate(CREATED)}Big revealThe river bent slowly around the old mill`,
		]);
		const current = rendered.container.querySelector("[aria-current=location]");
		expect(current?.closest("li")).toBe(rendered.container.querySelector("li"));

		await click(rendered.getButton(/Big reveal/));
		expect(onJump).toHaveBeenCalledWith(300);
	});

	it("renames a bookmark from its pencil, and leaves an unchanged label alone", async () => {
		const onRename = vi.fn();
		rendered = await render(
			<BookmarkList rows={[row()]} currentId={null} onJump={vi.fn()} onRename={onRename} />,
		);
		await click(rendered.getButton("Rename bookmark"));
		let input = rendered.container.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("no label field");
		act(() => input?.blur());
		expect(onRename).not.toHaveBeenCalled();

		await click(rendered.getButton("Rename bookmark"));
		input = rendered.container.querySelector<HTMLInputElement>("input");
		if (!input) throw new Error("no label field");
		const field = input;
		act(() => setInputValue(field, "Big reveal"));
		act(() => {
			field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(onRename).toHaveBeenCalledWith("a", "Big reveal");
		expect(rendered.container.querySelector("input")).toBeNull();
	});
});
