import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import { ColumnList } from "../column-picker";
import { moveColumn } from "../table-columns";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

function button(label: string): HTMLButtonElement {
	const found = [...document.body.querySelectorAll("button")].find(
		(b) => b.getAttribute("aria-label") === label,
	);
	if (!found) throw new Error(`no ${label} button`);
	return found;
}

async function openPicker(onMove = vi.fn(), onToggle = vi.fn()) {
	view = await render(
		<ColumnList columns={["title", "author", "rating"]} onToggle={onToggle} onMove={onMove} />,
	);
	return { onMove, onToggle };
}

describe("ColumnList", () => {
	it("moves a column up and down by one place", async () => {
		const { onMove } = await openPicker();
		await click(button("Move Rating up"));
		await click(button("Move Author down"));
		const [[upId, upBefore], [downId, downBefore]] = onMove.mock.calls;
		expect(moveColumn(["title", "author", "rating"], upId, upBefore)).toEqual([
			"title",
			"rating",
			"author",
		]);
		expect(moveColumn(["title", "author", "rating"], downId, downBefore)).toEqual([
			"title",
			"rating",
			"author",
		]);
	});

	it("keeps the first column behind Title and the last one at the end", async () => {
		await openPicker();
		expect(button("Move Author up").disabled).toBe(true);
		expect(button("Move Rating down").disabled).toBe(true);
		expect(() => button("Move Title up")).toThrow();
	});

	it("switches a hidden column on", async () => {
		const { onToggle } = await openPicker();
		const words = [...document.body.querySelectorAll("label")]
			.find((l) => l.textContent === "Words")
			?.querySelector("input");
		if (!words) throw new Error("no Words checkbox");
		expect(words.checked).toBe(false);
		await click(words);
		expect(onToggle).toHaveBeenCalledWith("words");
	});
});
