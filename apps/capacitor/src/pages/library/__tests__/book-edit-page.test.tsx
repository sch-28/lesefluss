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

const book = makeBook({
	id: "b1",
	title: "Red Rising",
	tags: serializeBookTags(["scifi"]),
	catalogId: "se:red-rising",
});
const updateBook = vi.fn(async (_vars: unknown) => {});
const saveSeries = vi.fn(async (_vars: unknown) => {});

vi.mock("../../../services/catalog/client", () => ({
	getCoverUrl: () => null,
	proxyImageUrl: (url: string) => url,
	getCatalogBook: async () => ({
		description: "<p>Darrow is a <i>Red</i>.</p>",
		summary: "Darrow is a Red.",
		subjects: null,
	}),
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

function makeRouter(origin: string | null = "/tabs/library/book/b1") {
	const root = createRootRoute({ component: () => <Outlet /> });
	const library = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library",
		component: () => <p>Library</p>,
	});
	const reader = createRoute({
		getParentRoute: () => root,
		path: "/tabs/reader/$id",
		component: () => <p>Reader</p>,
	});
	const detail = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library/book/$id",
		component: () => <p>Book detail</p>,
	});
	const edit = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library/book/$id/edit",
		component: () => <BookEditPage id="b1" />,
	});
	// Browser history, not memory history: only the browser one runs blockers on
	// back, which is the path Cancel and Android back take.
	// Pushed through the router's history so canGoBack sees a real entry to
	// return to, as an in-app tap would leave.
	window.history.replaceState(null, "", origin ?? "/tabs/library/book/b1/edit");
	const history = createBrowserHistory();
	if (origin) history.push("/tabs/library/book/b1/edit");
	return createRouter({
		routeTree: root.addChildren([library, reader, detail, edit]),
		history,
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

	it("keeps Save disabled until something changes", async () => {
		expect(button("Save").hasAttribute("disabled")).toBe(true);
		await type("book-title", "Golden Son");
		expect(button("Save").hasAttribute("disabled")).toBe(false);
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
		await click(button("Red Rising"));
		await click(button("No series"));
		await click(button("Save"));
		expect(saveSeries).toHaveBeenCalledWith({
			bookId: "b1",
			plan: { remove: "series-red-rising", add: null },
		});
	});

	it.each([
		["the library", "/tabs/library"],
		["the reader", "/tabs/reader/b1"],
	])("returns to %s it was opened from, on Cancel and on Save", async (_name, origin) => {
		for (const action of ["Cancel", "Save"]) {
			rendered.unmount();
			router = makeRouter(origin);
			rendered = await render(<RouterProvider router={router} />);
			await flush();
			if (action === "Save") await type("book-title", "Golden Son");
			await click(button(action));
			expect(path()).toBe(origin);
		}
	});

	it("falls back to the book's page when opened by a deep link", async () => {
		rendered.unmount();
		router = makeRouter(null);
		rendered = await render(<RouterProvider router={router} />);
		await flush();
		await click(button("Cancel"));
		expect(path()).toBe("/tabs/library/book/b1");
	});

	it("shows the detail page's catalog description in Description, and notes under Notes", async () => {
		await flush();
		const description = document.getElementById("book-description") as HTMLTextAreaElement;
		expect(description.value).toBe("");
		expect(description.placeholder).toBe("Darrow is a Red.");
		expect(body()).toContain("From the catalog.");
		const headings = [...document.querySelectorAll("h2")].map((h) => h.textContent);
		expect(headings).toContain("Notes");
		expect(headings).not.toContain("About");
	});

	it("picks the status from the same field-style picker as Language and Series", async () => {
		const status = document.getElementById("book-status") as HTMLButtonElement;
		const language = document.getElementById("book-language") as HTMLButtonElement;
		expect(status.className).toBe(language.className);
		await click(status);
		await click(button("Want to read"));
		await click(button("Save"));
		expect(updateBook).toHaveBeenCalledWith({
			id: "b1",
			values: expect.objectContaining({ status: "want" }),
		});
	});
});
