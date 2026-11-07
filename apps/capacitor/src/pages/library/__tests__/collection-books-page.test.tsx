import {
	createBrowserHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import type React from "react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { click, flush, type Rendered, render } from "../../../test/render";

const createWithBooks = vi.fn(async (_vars: unknown) => ({ id: "c-new" }));
const editCollection = vi.fn(async (_vars: unknown) => {});
const raiseImport = vi.fn();

vi.mock("virtua", () => ({
	Virtualizer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../components/book-cover", () => ({ default: () => null }));
vi.mock("../../../commands/global", () => ({ importRequest: { raise: () => raiseImport() } }));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useBooks: () => ({
			data: {
				books: [
					makeBook({ id: "b1", title: "Dune", addedAt: 3 }),
					makeBook({ id: "b2", title: "Emma", addedAt: 2 }),
					makeBook({ id: "b3", title: "Ulysses", addedAt: 1 }),
				],
				covers: new Map(),
			},
			isPending: false,
		}),
		useCollections: () => ({
			data: [
				{ id: "c1", name: "Classics", ordered: false, seriesKey: null, sortOrder: 1, bookCount: 1 },
				{ id: "c2", name: "Empty", ordered: false, seriesKey: null, sortOrder: 2, bookCount: 0 },
			],
			isPending: false,
		}),
		useCollectionBookIds: (id: string | null) => ({
			data: id === "c1" ? ["b2"] : [],
			isPending: false,
		}),
		useCollectionMemberships: () => ({ data: new Map([["b2", ["c1"]]]), isPending: false }),
		useCreateCollectionWithBooks: () => ({ mutateAsync: createWithBooks, isPending: false }),
		useEditCollection: () => ({ mutateAsync: editCollection, isPending: false }),
	},
}));

const { default: CollectionBooksPage } = await import("../collection-books-page");

let rendered: Rendered;
let router: ReturnType<typeof makeRouter>;

function makeRouter(at: string) {
	const root = createRootRoute({ component: () => <Outlet /> });
	const library = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library",
		validateSearch: (s: Record<string, unknown>) => ({ collection: s.collection as string }),
		component: () => <p>Library</p>,
	});
	const create = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library/collections/new",
		component: () => <CollectionBooksPage mode={{ kind: "create" }} />,
	});
	const add = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library/collections/$id/add",
		component: () => <CollectionBooksPage mode={{ kind: "add", id: add.useParams().id }} />,
	});
	const edit = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library/collections/$id/edit",
		component: () => <CollectionBooksPage mode={{ kind: "edit", id: edit.useParams().id }} />,
	});
	window.history.replaceState(null, "", "/tabs/library?collection=c1");
	window.history.pushState(null, "", at);
	return createRouter({
		routeTree: root.addChildren([library, create, add, edit]),
		history: createBrowserHistory(),
	});
}

async function open(at: string) {
	router = makeRouter(at);
	rendered = await render(<RouterProvider router={router} />);
	await flush();
}

const body = () => document.body.textContent ?? "";
const button = (name: string) => {
	const found = [...document.body.querySelectorAll("button")].find(
		(b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === name,
	);
	if (!found) throw new Error(`No button named ${name}`);
	return found;
};
const row = (id: string) =>
	document.body.querySelector(`[data-book-id="${id}"]`) as HTMLButtonElement;
const location = () => router.state.location;

async function type(id: string, text: string) {
	const input = document.getElementById(id) as HTMLInputElement;
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, text);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

beforeEach(() => {
	createWithBooks.mockClear();
	editCollection.mockClear();
	raiseImport.mockClear();
});
afterEach(() => rendered.unmount());

describe("CollectionBooksPage", () => {
	it("creates a collection with the picked books and opens it", async () => {
		await open("/tabs/library/collections/new");
		expect(button("Create collection").disabled).toBe(true);
		await type("collection-name", " Sci-fi ");
		await click(row("b3"));
		await click(row("b1"));
		await click(button("Create with 2 books"));

		expect(createWithBooks).toHaveBeenCalledWith({
			name: "Sci-fi",
			bookIds: ["b3", "b1"],
			ordered: false,
		});
		expect(body()).not.toContain("Discard");
		expect(location().pathname).toBe("/tabs/library");
		expect(location().search).toEqual({ collection: "c-new" });
	});

	it("creates an empty collection from a name alone", async () => {
		await open("/tabs/library/collections/new");
		await type("collection-name", "Later");
		await click(button("Create collection"));
		expect(createWithBooks).toHaveBeenCalledWith({ name: "Later", bookIds: [], ordered: false });
	});

	it("creates from the keyboard's action key, which submits the name's form", async () => {
		await open("/tabs/library/collections/new");
		await type("collection-name", "Later");
		const form = document.getElementById("collection-name")?.closest("form") as HTMLFormElement;
		await act(async () => {
			form.requestSubmit();
		});
		await flush();
		expect(createWithBooks).toHaveBeenCalledWith({ name: "Later", bookIds: [], ordered: false });
	});

	it("asks about changes, not picks, when only Keep in order was switched on", async () => {
		await open("/tabs/library/collections/new");
		await click(document.getElementById("collection-ordered") as HTMLElement);
		await click(button("Cancel"));
		expect(body()).toContain("Discard changes?");
		await click(button("Keep editing"));
	});

	it("adds picks to a collection, with its members locked", async () => {
		await open("/tabs/library/collections/c1/add");
		expect(body()).toContain("Add to Classics");
		expect(row("b2").disabled).toBe(true);
		expect(row("b2").textContent).toContain("In Classics");
		expect(button("Add books").disabled).toBe(true);
		await click(row("b1"));
		await click(button("Add 1 book"));

		expect(editCollection).toHaveBeenCalledWith({
			id: "c1",
			edit: { name: undefined, ordered: undefined, add: ["b1"], remove: [] },
		});
		expect(location().pathname).toBe("/tabs/library");
	});

	it("asks before dropping picks, and Keep editing stays", async () => {
		await open("/tabs/library/collections/c2/add");
		await click(row("b1"));
		await click(button("Cancel"));
		expect(body()).toContain("Discard 1 pick?");
		await click(button("Keep editing"));
		expect(location().pathname).toBe("/tabs/library/collections/c2/add");
		expect(editCollection).not.toHaveBeenCalled();
	});

	it("edits name, order and members in one save", async () => {
		await open("/tabs/library/collections/c1/edit");
		expect(row("b2").getAttribute("aria-pressed")).toBe("true");
		expect(button("Save").disabled).toBe(true);
		await type("collection-name", "Old books");
		await click(document.getElementById("collection-ordered") as HTMLElement);
		await click(row("b2"));
		await click(row("b3"));
		await click(button("Save"));

		expect(editCollection).toHaveBeenCalledWith({
			id: "c1",
			edit: { name: "Old books", ordered: true, add: ["b3"], remove: ["b2"] },
		});
	});

	it("leaves for the library's import sheet from Import new files", async () => {
		await open("/tabs/library/collections/c2/add");
		await click(button("Import new filesThey land in Empty"));
		expect(location().pathname).toBe("/tabs/library");
		expect(raiseImport).toHaveBeenCalledTimes(1);
	});
});
