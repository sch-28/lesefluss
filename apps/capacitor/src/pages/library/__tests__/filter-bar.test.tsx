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

	it("stays hidden with no chips and no shelf", async () => {
		view = await render(<FilterBar filter={{}} onChange={() => {}} options={options} />);
		expect(view.container.querySelector("[data-testid=filter-bar]")).toBeNull();
	});
});

describe("FilterBar on a shelf page", () => {
	const rule = { status: { in: ["reading"], out: [] } };

	it("locks the shelf's own rule chip and keeps an extra filter removable", async () => {
		const onChange = vi.fn();
		view = await render(
			<FilterBar
				filter={{ ...rule, tags: { in: ["sf"], out: [] }, words: { max: 50000 } }}
				onChange={onChange}
				options={options}
				shelfRule={rule}
			/>,
		);
		const removes = [...view.container.querySelectorAll("button")]
			.map((b) => b.getAttribute("aria-label"))
			.filter((l) => l?.startsWith("Remove filter"));
		expect(removes).toEqual([
			"Remove filter Tag: sf",
			expect.stringMatching(/^Remove filter Length:/),
		]);
		expect(view.text()).toContain("Status:");
		await click(view.getButton("Remove filter Tag: sf"));
		expect(onChange).toHaveBeenLastCalledWith({ ...rule, words: { max: 50000 } });
		await click(view.getButton("Clear"));
		expect(onChange).toHaveBeenLastCalledWith(rule);
	});

	it("offers Clear to bring back a rule value dropped elsewhere", async () => {
		const onChange = vi.fn();
		view = await render(
			<FilterBar
				filter={{ status: { in: [], out: [] } }}
				onChange={onChange}
				options={options}
				shelfRule={rule}
			/>,
		);
		await click(view.getButton("Clear"));
		expect(onChange).toHaveBeenLastCalledWith(rule);
	});

	it("offers no Clear while only the rule is on", async () => {
		view = await render(
			<FilterBar filter={rule} onChange={() => {}} options={options} shelfRule={rule} />,
		);
		expect(view.queryButton("Clear")).toBeNull();
		expect(view.container.querySelector('[aria-label^="Remove filter"]')).toBeNull();
	});
});
