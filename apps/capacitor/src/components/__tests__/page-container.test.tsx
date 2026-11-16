import { afterEach, describe, expect, it } from "vitest";
import { type Rendered, render } from "../../test/render";
import { PAGE_WIDTH_PX, PageContainer } from "../page-container";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const pageSources = import.meta.glob<string>(["../../pages/**/*.tsx", "../../routes/**/*.tsx"], {
	query: "?raw",
	import: "default",
	eager: true,
});

/** A page-sized cap written on a page itself; prefixed ones (sm:max-w-…) size dialogs. */
const OWN_PAGE_WIDTH =
	/(?<![\w:-])max-w-(?:[2-7]?xl|screen|prose|\[(?:[5-9]\d{2}|\d{4,})px\]|\[(?:2[4-9]|[3-9]\d|\d{3,})(?:\.\d+)?(?:rem|em|ch)\])|content-container/;
/** A centred wrapper as wide as a column (md and up): a page width, however narrow. */
const CENTRED_COLUMN = /className="(?=[^"]*\bmx-auto\b)(?=[^"]*(?<![\w:-])max-w-(?:md|lg)\b)[^"]*"/;

describe("PageContainer", () => {
	it("caps a flow at 448 px, a text page at 768 px and a book grid at 1280 px, centred", async () => {
		view = await render(
			<>
				<PageContainer width="text" data-testid="text" />
				<PageContainer width="grid" as="ol" data-testid="grid" />
			</>,
		);
		const text = view.container.querySelector('[data-testid="text"]');
		const grid = view.container.querySelector('[data-testid="grid"]');
		expect(PAGE_WIDTH_PX).toEqual({ flow: 448, text: 768, grid: 1280 });
		expect(text?.className).toContain("max-w-[768px]");
		expect(text?.className).toContain("mx-auto");
		expect(grid?.tagName).toBe("OL");
		expect(grid?.className).toContain("max-w-[1280px]");
		expect(grid?.className).toContain("mx-auto");
	});

	it("is the only source of a page width: no page or route sets its own", () => {
		expect(Object.keys(pageSources).length).toBeGreaterThan(50);
		const offenders = Object.entries(pageSources)
			.filter(
				([path, source]) =>
					!path.includes("__tests__") &&
					(OWN_PAGE_WIDTH.test(source) || CENTRED_COLUMN.test(source)),
			)
			.map(([path]) => path);
		expect(offenders).toEqual([]);
	});
});
