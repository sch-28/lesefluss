import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { groupLibrary } from "../group-by";
import { buildLibraryItems } from "../sort-filter";
import VirtualBookGrid, { estimateRowPx } from "../virtual-book-grid";

const books = Array.from({ length: 2000 }, (_, i) =>
	makeBook({ id: `b${i}`, title: `Book ${i}`, author: i % 2 ? "Ada Vance" : "Bo Lind" }),
);
const items = buildLibraryItems(books, [], new Map(), Date.now());

/** happy-dom lays nothing out: report every observed element as 800px tall,
 *  the viewport included, so virtua has sizes to window over. */
function stubLayout() {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(private readonly onResize: ResizeObserverCallback) {}
			observe(target: Element) {
				const height =
					target.hasAttribute("data-book-id") ||
					target.parentElement?.closest("[data-testid=library-items]")
						? 72
						: 800;
				queueMicrotask(() =>
					this.onResize(
						[{ target, contentRect: { width: 400, height } } as unknown as ResizeObserverEntry],
						this as unknown as ResizeObserver,
					),
				);
			}
			unobserve() {}
			disconnect() {}
		},
	);
	const offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
	Object.defineProperty(HTMLElement.prototype, "offsetParent", {
		configurable: true,
		get: () => document.body,
	});
	return () => {
		vi.unstubAllGlobals();
		if (offsetParent) Object.defineProperty(HTMLElement.prototype, "offsetParent", offsetParent);
	};
}

describe("VirtualBookGrid", () => {
	let restore: (() => void) | undefined;
	afterEach(() => {
		restore?.();
		restore = undefined;
	});

	it("renders a bounded slice of a large library", async () => {
		restore = stubLayout();
		const scroller = document.createElement("div");
		scroller.dataset.scrollRestorationId = "app-scroll";
		Object.defineProperty(scroller, "clientHeight", { value: 800 });
		document.body.append(scroller);
		const root = createRoot(scroller);
		await act(async () => {
			root.render(
				<VirtualBookGrid
					items={items}
					viewMode="list"
					renderItem={(item) => (item.kind === "book" ? <div data-book-id={item.book.id} /> : null)}
				/>,
			);
		});
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		const rendered = scroller.querySelectorAll("[data-book-id]").length;
		expect(rendered).toBeGreaterThan(0);
		expect(rendered).toBeLessThan(100);
		act(() => root.unmount());
		scroller.remove();
	});

	it("heads each group with its name and count, and folds a collapsed one to its heading", async () => {
		restore = stubLayout();
		const scroller = document.createElement("div");
		scroller.dataset.scrollRestorationId = "app-scroll";
		Object.defineProperty(scroller, "clientHeight", { value: 800 });
		document.body.append(scroller);
		const few = items.slice(0, 4);
		const groups = groupLibrary(few, "author", { collections: [], seriesMemberships: new Map() });
		const onToggleGroup = vi.fn();
		const root = createRoot(scroller);
		await act(async () => {
			root.render(
				<VirtualBookGrid
					items={few}
					viewMode="list"
					groups={groups}
					collapsed={new Set(["bo lind"])}
					onToggleGroup={onToggleGroup}
					renderItem={(item) => (item.kind === "book" ? <div data-book-id={item.book.id} /> : null)}
				/>,
			);
		});
		const headers = [
			...scroller.querySelectorAll<HTMLButtonElement>("[data-testid=library-group-header]"),
		];
		expect(headers.map((h) => [h.textContent, h.getAttribute("aria-expanded")])).toEqual([
			["Ada Vance2", "true"],
			["Bo Lind2", "false"],
		]);
		expect(
			[...scroller.querySelectorAll("[data-book-id]")].map((e) => e.getAttribute("data-book-id")),
		).toEqual(["b1", "b3"]);
		await act(async () => headers[1]?.click());
		expect(onToggleGroup).toHaveBeenCalledWith("bo lind");
		act(() => root.unmount());
		scroller.remove();
	});

	it("a background tap leaves selection and its click opens nothing; a drag or a book tap does not", async () => {
		restore = stubLayout();
		const scroller = document.createElement("div");
		scroller.dataset.scrollRestorationId = "app-scroll";
		Object.defineProperty(scroller, "clientHeight", { value: 800 });
		document.body.append(scroller);
		const onBackgroundTap = vi.fn();
		const root = createRoot(scroller);
		await act(async () => {
			root.render(
				<VirtualBookGrid
					items={items.slice(0, 2)}
					viewMode="list"
					onBackgroundTap={onBackgroundTap}
					renderItem={(item) => (item.kind === "book" ? <div data-book-id={item.book.id} /> : null)}
				/>,
			);
		});
		const grid = scroller.querySelector<HTMLElement>("[data-testid=library-items]");
		const press = (target: Element, from: number, to: number) => {
			target.dispatchEvent(
				new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: from, clientY: 0 }),
			);
			target.dispatchEvent(
				new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: to, clientY: 0 }),
			);
		};
		const book = scroller.querySelector("[data-book-id]");
		if (!grid || !book) throw new Error("grid not rendered");

		press(grid, 0, 40);
		press(book, 0, 0);
		expect(onBackgroundTap).not.toHaveBeenCalled();

		const card = document.createElement("button");
		const onCardClick = vi.fn();
		card.addEventListener("click", onCardClick);
		document.body.append(card);
		press(grid, 0, 2);
		expect(onBackgroundTap).toHaveBeenCalledOnce();
		card.click();
		expect(onCardClick).not.toHaveBeenCalled();
		card.click();
		expect(onCardClick).toHaveBeenCalledOnce();

		card.remove();
		act(() => root.unmount());
		scroller.remove();
	});

	it("estimates a grid row from the cover width", () => {
		expect(estimateRowPx("list", 1, 390)).toBe(72);
		// 390px: three 109px covers, 163px tall, plus text and gap.
		expect(estimateRowPx("grid", 3, 390)).toBe(251);
		// Wide screens cap the content at 900px.
		expect(estimateRowPx("grid", 6, 1400)).toBe(estimateRowPx("grid", 6, 2400));
	});
});
