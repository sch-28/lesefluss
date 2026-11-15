import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import type { ExploreSearch } from "../explore-search";
import FilterRow from "../filter-row";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const renderRow = async (search: ExploreSearch, onChange = vi.fn()) => {
	view = await render(
		<FilterRow
			search={search}
			lang="en"
			genres={[]}
			languages={[]}
			tagLabels={new Map()}
			facets={undefined}
			onChange={onChange}
			onAddTag={vi.fn()}
			onRemoveTag={vi.fn()}
			onBrowseTags={vi.fn()}
		/>,
	);
	return onChange;
};

describe("fits tonight chip", () => {
	it("turns on in place of a length bucket", async () => {
		const onChange = await renderRow({ length: "long" });
		const chip = view?.getButton("Fits tonight") as HTMLButtonElement;
		expect(chip.getAttribute("aria-pressed")).toBe("false");
		await click(chip);
		expect(onChange).toHaveBeenCalledWith({ fits: "tonight", length: undefined });
	});

	it("turns off when tapped again", async () => {
		const onChange = await renderRow({ fits: "tonight" });
		const chip = view?.getButton("Fits tonight") as HTMLButtonElement;
		expect(chip.getAttribute("aria-pressed")).toBe("true");
		await click(chip);
		expect(onChange).toHaveBeenCalledWith({ fits: undefined });
	});
});

describe("chip look and labels", () => {
	it("draws every filter and tag control as the one chip", async () => {
		view = await render(
			<FilterRow
				search={{ author: "Austen", tags: "t1" }}
				lang="en"
				genres={[]}
				languages={[]}
				tagLabels={new Map([["t1", "Romance"]])}
				facets={[{ id: "t2", label: "Satire", count: 4 }]}
				onChange={vi.fn()}
				onAddTag={vi.fn()}
				onRemoveTag={vi.fn()}
				onBrowseTags={vi.fn()}
			/>,
		);
		for (const name of [
			"Fits tonight",
			"Tags",
			"Remove author filter Austen",
			"Remove tag Romance",
			"Add tag Satire",
		]) {
			expect(view.getButton(name).getAttribute("data-slot")).toBe("filter-chip");
		}
		expect(view.getButton("Remove tag Romance").hasAttribute("aria-pressed")).toBe(false);
	});

	it("never shows a genre's raw id while the genre list loads", async () => {
		view = await render(
			<FilterRow
				search={{ genre: "science-fiction" }}
				lang="en"
				genres={undefined}
				languages={[]}
				tagLabels={new Map()}
				facets={undefined}
				onChange={vi.fn()}
				onAddTag={vi.fn()}
				onRemoveTag={vi.fn()}
				onBrowseTags={vi.fn()}
			/>,
		);
		expect(view.text()).not.toContain("science-fiction");
		expect(view.text()).toContain("Genre");
	});
});
