import { SearchX } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { type Rendered, render } from "../../test/render";
import { EMPTY_STATE_PAGE, EmptyState } from "../empty-state";
import { SectionHeader } from "../section-header";
import { TextCover, titleHue } from "../text-cover";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

describe("EmptyState", () => {
	it("renders the title as a heading, the message and the action", async () => {
		view = await render(
			<EmptyState
				icon={SearchX}
				title="No books match"
				action={<button type="button">Clear</button>}
			>
				Try another search.
			</EmptyState>,
		);
		expect(view.container.querySelector("h2")?.textContent).toBe("No books match");
		expect(view.text()).toContain("Try another search.");
		expect(view.getButton("Clear")).toBeTruthy();
	});

	it("as a page's only content, takes the free height on desktop so it sits centred", async () => {
		view = await render(<EmptyState page title="No highlights yet" />);
		const root = view.container.firstElementChild as HTMLElement;
		expect(root.dataset.emptyState).toBe("page");
		expect(root.className).toContain(EMPTY_STATE_PAGE);
		expect(root.className).toContain("justify-center");
	});

	it("inline keeps its natural height", async () => {
		view = await render(<EmptyState title="Nothing yet" />);
		const root = view.container.firstElementChild as HTMLElement;
		expect(root.dataset.emptyState).toBe("inline");
		expect(root.className).not.toContain(EMPTY_STATE_PAGE);
	});

	it("renders without a title", async () => {
		view = await render(<EmptyState>Nothing here.</EmptyState>);
		expect(view.container.querySelector("h2")).toBeNull();
		expect(view.text()).toBe("Nothing here.");
	});
});

describe("SectionHeader", () => {
	it("renders a sentence-case title, subtitle and aside", async () => {
		view = await render(<SectionHeader title="Finished" subtitle="This year" aside="12" />);
		const heading = view.container.querySelector("h2");
		expect(heading?.textContent).toBe("Finished");
		expect(heading?.className).not.toContain("uppercase");
		expect(view.text()).toContain("This year");
		expect(view.text()).toContain("12");
	});
});

describe("TextCover", () => {
	it("shows title and author", async () => {
		view = await render(<TextCover title="Dune" author="Frank Herbert" />);
		expect(view.text()).toBe("DuneFrank Herbert");
	});

	it("drops the author when compact", async () => {
		view = await render(<TextCover title="Dune" author="Frank Herbert" compact />);
		expect(view.text()).toBe("Dune");
	});

	it("derives a stable hue per title", () => {
		expect(titleHue("Dune")).toBe(titleHue("Dune"));
		expect(titleHue("Dune")).not.toBe(titleHue("Emma"));
		expect(titleHue("Dune")).toBeGreaterThanOrEqual(0);
		expect(titleHue("Dune")).toBeLessThan(360);
	});

	it("uses a given tint", async () => {
		view = await render(<TextCover title="Dune" tint="#ff0000" />);
		expect(
			view.container.querySelector('[data-testid="text-cover"]')?.getAttribute("style"),
		).toContain("#ff0000");
	});
});
