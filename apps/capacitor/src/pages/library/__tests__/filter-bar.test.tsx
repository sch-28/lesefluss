import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";
import FilterBar from "../filter-bar";
import { FACETS } from "../filter-model";
import type { FacetOptions } from "../filter-picker";

const options = Object.fromEntries(FACETS.map((f) => [f, []])) as unknown as FacetOptions;

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("FilterBar shelf conditions", () => {
	it("shows a shelf the chips cannot hold as one chip that opens the editor", async () => {
		const onEdit = vi.fn();
		view = await render(
			<FilterBar
				filter={{}}
				onChange={() => {}}
				options={options}
				shelfConditions={{ isCustom: true, onEdit }}
			/>,
		);
		expect(view.queryButton("Edit conditions")).toBeNull();
		await click(view.getButton("Edit custom conditions"));
		expect(onEdit).toHaveBeenCalledTimes(1);
	});

	it("offers a chip shelf its editor beside the chips", async () => {
		const onEdit = vi.fn();
		view = await render(
			<FilterBar
				filter={{ status: { in: ["reading"], out: [] } }}
				onChange={() => {}}
				options={options}
				shelfConditions={{ isCustom: false, onEdit }}
			/>,
		);
		expect(view.queryButton("Edit custom conditions")).toBeNull();
		await click(view.getButton("Edit conditions"));
		expect(onEdit).toHaveBeenCalledTimes(1);
	});

	it("stays hidden with no chips, no shelf and no Add filter", async () => {
		view = await render(<FilterBar filter={{}} onChange={() => {}} options={options} />);
		expect(view.container.querySelector("[data-testid=filter-bar]")).toBeNull();
	});
});
