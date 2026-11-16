import { afterEach, describe, expect, it, vi } from "vitest";
import type { PopoverSection } from "../../../components/selection-popover";
import { type Rendered, render } from "../../../test/render";

vi.mock("../../../components/selection-popover", () => ({
	default: ({ sections }: { sections: PopoverSection<string>[] }) => (
		<div>
			{sections.map((section) => (
				<section key={section.heading} data-heading={section.heading}>
					{section.options.map((option) => (
						<button
							key={option}
							type="button"
							data-selected={section.selected === option || undefined}
							onClick={() => section.onSelect(option)}
						>
							{section.labels[option]}
						</button>
					))}
				</section>
			))}
		</div>
	),
}));

const { default: SortPopover } = await import("../sort-popover");

let rendered: Rendered;
afterEach(() => rendered.unmount());

const section = (heading: string) =>
	rendered.container.querySelector<HTMLElement>(`[data-heading="${heading}"]`);
const labels = (heading: string) =>
	[...(section(heading)?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
const selected = (heading: string) =>
	section(heading)?.querySelector("[data-selected]")?.textContent;

describe("SortPopover", () => {
	it("offers Series order first on a series, selected by default, with nothing to break ties", async () => {
		const onSort = vi.fn();
		rendered = await render(
			<SortPopover
				trigger={null}
				sortBy="seriesOrder"
				onSort={onSort}
				reversed={false}
				onReversed={() => {}}
				thenBy="none"
				onThenBy={() => {}}
				hasSeriesOrder
			/>,
		);
		expect(labels("Sort by")[0]).toBe("Series order");
		expect(selected("Sort by")).toBe("Series order");
		expect(selected("Order")).toBe("Ascending");
		expect(section("Then by")).toBeNull();
		rendered.getButton("Title").click();
		expect(onSort).toHaveBeenCalledWith("title");
	});

	it("keeps Series order out of the library's own sort", async () => {
		rendered = await render(
			<SortPopover
				trigger={null}
				sortBy="recent"
				onSort={() => {}}
				reversed={false}
				onReversed={() => {}}
				thenBy="none"
				onThenBy={() => {}}
			/>,
		);
		expect(labels("Sort by")).not.toContain("Series order");
		expect(selected("Order")).toBe("Descending");
		expect(section("Then by")).not.toBeNull();
	});
});
