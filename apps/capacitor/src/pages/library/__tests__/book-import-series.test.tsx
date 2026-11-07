import { seriesCollectionId } from "@lesefluss/core";
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
import type { ImportSeriesState } from "../../../services/db/queries/collections";
import { makeBook } from "../../../test/book-fixture";
import { click, flush, type Rendered, render } from "../../../test/render";

const commitStagedImport = vi.fn(
	async (staged: { payload: { title: string } }, _patch: unknown, _series: unknown) =>
		makeBook({ title: staged.payload.title }),
);
const RED_RISING = seriesCollectionId("red rising");
const DUNE = seriesCollectionId("dune");
let seriesState: ImportSeriesState;
let askedKey: string | null | undefined;

vi.mock("../../../services/book-import", () => ({
	commitStagedImport: (staged: { payload: { title: string } }, patch: unknown, series: unknown) =>
		commitStagedImport(staged, patch, series),
	attachOriginalToBook: vi.fn(),
	findAttachCandidate: async () => null,
}));
vi.mock("../../../services/sync", () => ({ scheduleSyncPush: () => {} }));
vi.mock("../../../components/toast", () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock("../../../services/catalog/client", () => ({ proxyImageUrl: (url: string) => url }));
vi.mock("../../../services/db/hooks", () => ({
	queryHooks: {
		useImportSeriesState: (key: string | null) => {
			askedKey = key;
			return { data: key ? seriesState : undefined };
		},
		useCollections: () => ({
			data: [
				{
					id: RED_RISING,
					name: "Red Rising",
					ordered: true,
					seriesKey: "red rising",
					sortOrder: 1,
					bookCount: 2,
				},
				{
					id: DUNE,
					name: "Dune",
					ordered: true,
					seriesKey: "dune",
					sortOrder: 2,
					bookCount: 4,
				},
				{
					id: "c2",
					name: "Favourites",
					ordered: false,
					seriesKey: null,
					sortOrder: 3,
					bookCount: 9,
				},
			],
		}),
	},
}));

const { ImportStagingProvider, useImportStaging } = await import(
	"../../../contexts/import-staging-context"
);
const { default: BookImportPage } = await import("../book-import-page");

type Stage = ReturnType<typeof useImportStaging>["stage"];
let stage: Stage;
function StageProbe() {
	stage = useImportStaging().stage;
	return null;
}

const staged = (title: string, series?: { seriesName: string; seriesIndex: number | null }) => ({
	payload: { title, content: "words", fileFormat: "epub" as const, ...series },
	extras: {},
	cleanup: vi.fn(),
});

const joins: ImportSeriesState = {
	collection: { id: RED_RISING, name: "Red Rising", deleted: false, bookCount: 2 },
	others: [{ id: "b1", title: "Red Rising" }],
};

let rendered: Rendered;

function makeRouter() {
	const root = createRootRoute({
		component: () => (
			<ImportStagingProvider>
				<StageProbe />
				<Outlet />
			</ImportStagingProvider>
		),
	});
	const library = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library",
		component: () => <p>Library</p>,
	});
	const importPage = createRoute({
		getParentRoute: () => root,
		path: "/tabs/library/import",
		component: BookImportPage,
	});
	window.history.replaceState(null, "", "/tabs/library");
	return createRouter({
		routeTree: root.addChildren([library, importPage]),
		history: createBrowserHistory(),
	});
}

const body = () => document.body.textContent ?? "";
const buttons = () => [...document.body.querySelectorAll("button")];
const button = (name: string) => {
	const found = buttons().find((b) => (b.textContent ?? "").trim() === name);
	if (!found) throw new Error(`No button named ${name}`);
	return found;
};
const seriesButton = () => {
	const found = buttons().find((b) => /(Change|Add)$/.test((b.textContent ?? "").trim()));
	if (!found) throw new Error("No series button");
	return found;
};
const indexInput = () => document.getElementById("book-series-index") as HTMLInputElement | null;

async function settle() {
	await flush();
	await flush();
}

async function open(entry: ReturnType<typeof staged>) {
	await act(async () => stage(entry));
	await settle();
}

async function addToLibrary() {
	await click(button("Add to library"));
	await settle();
}

async function typeIndex(value: string) {
	const input = indexInput();
	if (!input) throw new Error("No series number");
	await act(async () => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

const seriesArg = () => commitStagedImport.mock.calls[0]?.[2];

beforeEach(async () => {
	commitStagedImport.mockClear();
	seriesState = joins;
	askedKey = undefined;
	rendered = await render(<RouterProvider router={makeRouter()} />);
	await flush();
});

afterEach(() => rendered.unmount());

describe("BookImportPage series row", () => {
	it("shows the file's series and number, says it joins, and keeps it on Add", async () => {
		await open(staged("Morning Star", { seriesName: "Red Rising", seriesIndex: 3 }));

		expect(askedKey).toBe("red rising");
		expect(seriesButton().textContent).toContain("Red Rising");
		expect(seriesButton().textContent).toContain("from file");
		expect(indexInput()?.value).toBe("3");
		expect(body()).toContain("Joins your series Red Rising (2 books)");

		await addToLibrary();
		expect(commitStagedImport).toHaveBeenCalledOnce();
		expect(seriesArg()).toBeUndefined();
	});

	it("says it starts the series with the book already in the library", async () => {
		seriesState = { collection: null, others: [{ id: "b9", title: "Leviathan Wakes" }] };
		await open(staged("Caliban's War", { seriesName: "The Expanse", seriesIndex: 2 }));
		expect(body()).toContain('Starts the series The Expanse with "Leviathan Wakes"');
	});

	it("says it becomes a series once a second book is added", async () => {
		seriesState = { collection: null, others: [] };
		await open(staged("Caliban's War", { seriesName: "The Expanse", seriesIndex: 2 }));
		expect(body()).toContain("Becomes a series once a 2nd book of it is added");
	});

	it("says a dismissed series stays out and does not bring it back", async () => {
		seriesState = {
			collection: { id: DUNE, name: "Dune", deleted: true, bookCount: 0 },
			others: [],
		};
		await open(staged("Dune Messiah", { seriesName: "Dune", seriesIndex: 2 }));
		expect(seriesButton().textContent).toContain("Not in a series");
		expect(body()).toContain("The file says Dune #2, but you removed that series.");
		expect(indexInput()).toBeNull();

		await addToLibrary();
		expect(seriesArg()).toBeUndefined();
	});

	it("passes a changed number for the file's series", async () => {
		await open(staged("Morning Star", { seriesName: "Red Rising", seriesIndex: 3 }));
		await typeIndex("4");
		await addToLibrary();
		expect(seriesArg()).toEqual({ kind: "detected", index: 4 });
	});

	it("keeps the book out of the file's series with No series", async () => {
		await open(staged("Morning Star", { seriesName: "Red Rising", seriesIndex: 3 }));
		await click(seriesButton());
		expect(body()).toContain("From the file");
		expect(body()).toContain("keeps this book out of Red Rising");
		await click(button("No series"));

		expect(body()).toContain("This book stays out of that series");
		expect(indexInput()).toBeNull();
		await addToLibrary();
		expect(seriesArg()).toEqual({ kind: "none" });
	});

	it("puts the book in a plain collection instead, with no number", async () => {
		await open(staged("Morning Star", { seriesName: "Red Rising", seriesIndex: 3 }));
		await click(seriesButton());
		// The file's series is offered once, in its own group, not again under Your series.
		expect(buttons().filter((b) => b.textContent?.startsWith("Red Rising"))).toHaveLength(2);
		await click(button("Favourites9 books"));

		expect(seriesButton().textContent).toContain("Favourites");
		expect(indexInput()).toBeNull();
		await addToLibrary();
		expect(seriesArg()).toEqual({ kind: "collection", collectionId: "c2", index: 3 });
	});

	it("shows the plain row for a file that names no series", async () => {
		await open(staged("Standalone"));
		expect(askedKey).toBeNull();
		expect(seriesButton().textContent).toContain("No series");
		expect(body()).not.toContain("from file");
		expect(body()).not.toContain("The file says");

		await click(seriesButton());
		expect(body()).not.toContain("From the file");
		expect(body()).not.toContain("Favourites");
		await click(button("No series"));
		await addToLibrary();
		expect(commitStagedImport).toHaveBeenCalledOnce();
		expect(seriesArg()).toEqual({ kind: "none" });
	});
});
