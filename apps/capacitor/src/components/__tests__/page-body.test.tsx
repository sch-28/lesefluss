import { afterEach, describe, expect, it } from "vitest";
import { type Rendered, render } from "../../test/render";
import { PageBody, PageToolbar } from "../page-body";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const classOf = (id: string) =>
	view?.container.querySelector(`[data-testid="${id}"]`)?.className.split(" ") ?? [];

describe("PageBody", () => {
	it("starts 12 px under the header, flush under a toolbar, and has one bottom padding", async () => {
		view = await render(
			<>
				<PageBody width="text" data-testid="plain" />
				<PageBody width="grid" belowToolbar data-testid="below" />
				<PageBody width="grid" fab as="main" data-testid="fab" />
				<PageBody width="grid" fab fixedBar data-testid="bar" />
			</>,
		);
		expect(classOf("plain")).toEqual(expect.arrayContaining(["px-4", "pt-3", "pb-10"]));
		expect(classOf("below")).not.toContain("pt-3");
		expect(classOf("below")).toContain("pb-10");
		expect(classOf("fab")).toEqual(expect.arrayContaining(["pt-3", "pb-24", "md:pb-10"]));
		expect(view.container.querySelector('[data-testid="fab"]')?.tagName).toBe("MAIN");
		expect(classOf("plain")).toContain("[&>*:first-child]:mt-0");
		expect(classOf("bar")).toContain("pb-24");
		expect(classOf("bar")).not.toContain("md:pb-10");
	});
});

describe("PageToolbar", () => {
	it("pads its rows by 8 and collapses when it has none", async () => {
		view = await render(
			<>
				<PageToolbar data-testid="bar" />
				<PageToolbar sticky data-testid="sticky" />
			</>,
		);
		expect(classOf("bar")).toEqual(expect.arrayContaining(["py-2", "empty:hidden"]));
		expect(classOf("bar")).not.toContain("sticky");
		expect(classOf("sticky")).toEqual(
			expect.arrayContaining(["sticky", "top-[calc(var(--safe-top)+3rem+1px)]"]),
		);
	});
});
