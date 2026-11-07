import { serializeBookTags } from "@lesefluss/core";
import { consumeBackPress } from "@lesefluss/ui/overlay-back";
import {
	createBrowserHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { click, flush, type Rendered, render } from "../../../test/render";

const book = makeBook({ id: "b1", title: "Red Rising", tags: serializeBookTags(["scifi"]) });
const updateBook = vi.fn(async (_vars: unknown) => {});
const saveSeries = vi.fn(async (_vars: unknown) => {});

vi.mock("../../../services/catalog/client", () => ({
	getCoverUrl: () => null,
	proxyImageUrl: (url: string) => url,
}));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useBook: () => ({ data: book, isPending: false }),
		useSeriesMembershipForBook: () => ({
			data: { collectionId: "series-red-rising", seriesIndex: 1 },
			isPending: false,
		}),
		useCollections: () => ({
			data: [
				{
					id: "series-red-rising",
					name: "Red Rising",
					ordered: true,
					seriesKey: "red rising",
					sortOrder: 1,
					bookCount: 3,
				},
				{
					id: "c2",
					name: "Favourites",
					ordered: false,
					seriesKey: null,
					sortOrder: 2,
					bookCount: 9,
				},
			],
		}),
		useBooks: () => ({ data: { covers: new Map() } }),
		useUpdateBook: () => ({ mutateAsync: updateBook, isPending: false }),
		useSaveBookSeries: () => ({ mutateAsync: saveSeries, isPending: false }),
	},
}));

const { default: BookEditPage } = await import("../book-edit-page");

let rendered: Rendered;
let router: ReturnType<typeof makeRouter>;

function makeRouter() {
	const root = createRootRoute({ component: () => <Outlet /> });
	const detail = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library/book/$id",
		component: () => <p>Book detail</p>,
	});
	const edit = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library/book/$id/edit",
		component: () => <BookEditPage id="b1" fromDetail />,
	});
	// Browser history, not memory history: only the browser one runs blockers on
	// back, which is the path Cancel and Android back take.
	window.history.replaceState(null, "", "/tabs/library/book/b1");
	window.history.pushState(null, "", "/tabs/library/book/b1/edit");
	return createRouter({
		routeTree: root.addChildren([detail, edit]),
		history: createBrowserHistory(),
	});
}

const body = () => document.body.textContent ?? "";
const button = (name: string) => {
	const found = [...document.body.querySelectorAll("button")].find(
		(b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === name,
	);
	if (!found) throw new Error(`No button named ${name}`);
	return found;
};
const path = () => router.state.location.pathname;

async function type(id: string, text: string) {
	const input = document.getElementById(id) as HTMLInputElement;
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

beforeEach(async () => {
	updateBook.mockClear();
	saveSeries.mockClear();
	router = makeRouter();
	rendered = await render(<RouterProvider router={router} />);
	await flush();
});

afterEach(() => rendered.unmount());

describe("BookEditPage", () => {
	it("leaves without asking when nothing changed", async () => {
		expect(path()).toBe("/tabs/library/book/b1/edit");
		await click(button("Cancel"));
		expect(path()).toBe("/tabs/library/book/b1");
		expect(updateBook).not.toHaveBeenCalled();
	});

	it("asks before discarding, and Keep editing stays on the page", async () => {
		await type("book-title", "Golden Son");
		expect(body()).toContain("Unsaved");

		await click(button("Cancel"));
		expect(body()).toContain("Discard changes?");
		expect(path()).toBe("/tabs/library/book/b1/edit");

		await click(button("Keep editing"));
		expect(body()).not.toContain("Discard changes?");
		expect(path()).toBe("/tabs/library/book/b1/edit");

		await click(button("Cancel"));
		await click(button("Discard"));
		expect(path()).toBe("/tabs/library/book/b1");
		expect(updateBook).not.toHaveBeenCalled();
	});

	it("closes the prompt on Android back instead of prompting again", async () => {
		await type("book-title", "Golden Son");
		await act(async () => router.history.back());
		await flush();
		expect(body()).toContain("Discard changes?");

		await act(async () => {
			expect(consumeBackPress()).toBe(true);
		});
		await flush();
		expect(body()).not.toContain("Discard changes?");
		expect(path()).toBe("/tabs/library/book/b1/edit");
	});

	it("saves the fields and the series number, then returns without a prompt", async () => {
		await type("book-title", "Red Rising ");
		await type("book-series-index", "2");
		await click(button("Save"));

		expect(updateBook).toHaveBeenCalledWith({
			id: "b1",
			values: expect.objectContaining({ title: "Red Rising", tags: serializeBookTags(["scifi"]) }),
		});
		expect(saveSeries).toHaveBeenCalledWith({
			bookId: "b1",
			plan: {
				remove: null,
				add: { kind: "collection", collectionId: "series-red-rising", index: 2 },
			},
		});
		expect(body()).not.toContain("Discard changes?");
		expect(path()).toBe("/tabs/library/book/b1");
	});

	it("removes the book from its series on Save", async () => {
		await click(button("Red RisingChange"));
		await click(button("No series"));
		await click(button("Save"));
		expect(saveSeries).toHaveBeenCalledWith({
			bookId: "b1",
			plan: { remove: "series-red-rising", add: null },
		});
	});
});
