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
