import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../../test/render";

vi.mock("../../../components/app-shell/page-header", () => ({
	PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

const { DetailShell } = await import("../detail-shell");

const tags = Array.from({ length: 11 }, (_, i) => ({ id: `tag-${i}`, label: `Tag ${i}` }));

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

const renderShell = (onTagTap = vi.fn()) =>
	render(
		<DetailShell
			cover={null}
			title="Book"
			subjects={["Raw subject"]}
			tagLinks={{ tags, onTap: onTagTap }}
			primaryAction={{ label: "Read now", onClick: vi.fn() }}
		/>,
	);

describe("DetailShell tags", () => {
	it("collapses long tag lists behind 'more' and expands to all of them", async () => {
		view = await renderShell();
		const list = () => view?.container.querySelector('[data-testid="detail-tags"]');
		expect(list()?.textContent).toContain("Tag 7");
		expect(list()?.textContent).not.toContain("Tag 8");
		await click(view.getButton("3 more"));
		expect(list()?.textContent).toContain("Tag 10");
		expect(view.queryButton("3 more")).toBeNull();
	});

	it("reports the tapped tag id and replaces raw subjects", async () => {
		const onTagTap = vi.fn();
		view = await renderShell(onTagTap);
		await click(view.getButton("Tag 2"));
		expect(onTagTap).toHaveBeenCalledWith("tag-2");
		expect(view.text()).not.toContain("Raw subject");
	});
});

describe("DetailShell subjects", () => {
	it("shows raw subjects as the same chips, without a tap action", async () => {
		view = await render(
			<DetailShell
				cover={null}
				title="Book"
				subjects={["Fiction -- Sea stories", "Whaling"]}
				primaryAction={{ label: "Read now", onClick: vi.fn() }}
			/>,
		);
		const chips = [
			...(view.container.querySelector('[data-testid="detail-tags"]')?.children ?? []),
		];
		expect(chips.map((c) => c.textContent)).toEqual(["Fiction", "Sea stories", "Whaling"]);
		expect(chips.every((c) => c.tagName === "SPAN" && c.className.includes("rounded-full"))).toBe(
			true,
		);
	});
});

describe("DetailShell actions", () => {
	const atWidth = (isWide: boolean) =>
		vi.spyOn(window, "matchMedia").mockImplementation(
			(query: string) =>
				({
					matches: isWide,
					media: query,
					addEventListener: () => {},
					removeEventListener: () => {},
				}) as unknown as MediaQueryList,
		);
	afterEach(() => vi.restoreAllMocks());

	const renderActions = () =>
		render(
			<DetailShell
				cover={null}
				title="Book"
				primaryAction={{ label: "Read now", onClick: vi.fn() }}
				secondaryActions={[{ label: "Add to wishlist", onClick: vi.fn() }]}
			/>,
		);

	it("groups the primary and secondary actions beside the cover on desktop, secondary as wide as its label", async () => {
		atWidth(true);
		view = await renderActions();
		const group = view.container.querySelector('[data-testid="detail-actions"]');
		expect(group?.contains(view.getButton("Read now"))).toBe(true);
		expect(group?.contains(view.getButton("Add to wishlist"))).toBe(true);
		expect(group?.closest("section")).not.toBeNull();
		expect(view.getButton("Add to wishlist").className).not.toMatch(/(^|\s)w-full(\s|$)/);
	});

	it("puts the secondary actions full width below the cover on a phone, as in 2.2.0", async () => {
		atWidth(false);
		view = await renderActions();
		const hero = view.container.querySelector('[data-testid="detail-actions"]');
		expect(hero?.contains(view.getButton("Read now"))).toBe(true);
		expect(hero?.contains(view.getButton("Add to wishlist"))).toBe(false);
		const below = view.container.querySelector('[data-testid="detail-actions-below"]');
		expect(below?.closest("section")).toBeNull();
		expect(below?.contains(view.getButton("Add to wishlist"))).toBe(true);
		expect(view.getButton("Add to wishlist").className).toMatch(/(^|\s)w-full(\s|$)/);
	});
});

describe("DetailShell primary action", () => {
	it("keeps the detail apart from the label, hidden until the button has room", async () => {
		view = await render(
			<DetailShell
				cover={null}
				title="Book"
				primaryAction={{ label: "Continue · 5 min left", detail: "Chapter Two", onClick: vi.fn() }}
			/>,
		);
		const button = view.getButton(/Continue · 5 min left/);
		expect(button.className).toMatch(/(^|\s)@container(\s|$)/);
		const detail = [...button.querySelectorAll("span")].find(
			(span) => span.textContent === " · Chapter Two",
		);
		expect(detail?.className).toMatch(/(^|\s)hidden(\s|$)/);
		expect(detail?.className).toMatch(/@md:inline/);
	});

	it("on desktop is as wide as its label, capped at its column so a long chapter truncates", async () => {
		view = await render(
			<DetailShell
				cover={null}
				title="Book"
				primaryAction={{ label: "Continue", detail: "A very long chapter", onClick: vi.fn() }}
			/>,
		);
		const classes = view.getButton(/Continue/).className.split(/\s+/);
		expect(classes).toEqual(expect.arrayContaining(["md:w-auto", "md:max-w-full"]));
		expect(view.getButton(/Continue/).querySelector(".truncate")).not.toBeNull();
	});
});
