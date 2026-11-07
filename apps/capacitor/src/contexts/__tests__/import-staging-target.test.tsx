import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeBook } from "../../test/book-fixture";
import { flush, type Rendered, render } from "../../test/render";

const written = makeBook({ id: "new-book", title: "Dune" });
const commitStagedImport = vi.fn(
	async (_staged: unknown, _patch: unknown, _series?: unknown) => written,
);
const addBooksToCollection = vi.fn(async (_id: string, _bookIds: string[]) => {});
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("../../services/book-import", () => ({
	commitStagedImport: (staged: unknown, patch: unknown, series?: unknown) =>
		commitStagedImport(staged, patch, series),
	attachOriginalToBook: async () => ({ fileCopyFailed: false }),
	findAttachCandidate: async () => null,
}));
vi.mock("../../services/db/queries/collections", () => ({
	addBooksToCollection: (id: string, bookIds: string[]) => addBooksToCollection(id, bookIds),
}));
vi.mock("../../services/sync", () => ({ scheduleSyncPush: () => {} }));
vi.mock("../../components/toast", () => ({
	toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));

const { ImportStagingProvider, IMPORT_PATH, useImportQueue, useImportStaging } = await import(
	"../import-staging-context"
);
type Staging = ReturnType<typeof useImportStaging>;
type ImportSeriesChoice = Parameters<Queue["commit"]>[1];
type Queue = ReturnType<typeof useImportQueue>;

let staging: Staging;
let queue: Queue;
let rendered: Rendered;

const Probe = () => {
	staging = useImportStaging();
	queue = useImportQueue();
	return null;
};

function makeRouter() {
	const root = createRootRoute({
		component: () => (
			<ImportStagingProvider>
				<Probe />
				<Outlet />
			</ImportStagingProvider>
		),
	});
	const home = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
	const confirm = createRoute({
		getParentRoute: () => root,
		path: IMPORT_PATH,
		component: () => null,
	});
	return createRouter({
		routeTree: root.addChildren([home, confirm]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
}

async function stageAndCommit(targetCollectionId?: string, series?: ImportSeriesChoice) {
	await act(async () => {
		staging.stage({
			payload: { title: "Dune", content: "x" } as never,
			extras: {},
			targetCollectionId,
		});
	});
	await flush();
	const values = queue.initial;
	if (!values) throw new Error("nothing staged");
	await act(async () => queue.commit(values, series));
	await flush();
}

beforeEach(async () => {
	commitStagedImport.mockClear();
	addBooksToCollection.mockReset();
	toastError.mockClear();
	toastSuccess.mockClear();
	rendered = await render(<RouterProvider router={makeRouter()} />);
	await flush();
});
afterEach(() => rendered.unmount());

describe("import into a collection", () => {
	it("adds the committed book to the collection it was started from", async () => {
		await stageAndCommit("c1");
		expect(addBooksToCollection).toHaveBeenCalledWith("c1", ["new-book"]);
		expect(toastSuccess).toHaveBeenCalledWith('Added "Dune"');
		expect(queue.current).toBeNull();
	});

	it("joins the collection it was started from also when the series row moved the book", async () => {
		await stageAndCommit("c1", { kind: "none" });
		expect(commitStagedImport).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
			kind: "none",
		});
		expect(addBooksToCollection).toHaveBeenCalledWith("c1", ["new-book"]);
	});

	it("leaves collections alone for an import without a target", async () => {
		await stageAndCommit();
		expect(commitStagedImport).toHaveBeenCalledTimes(1);
		expect(addBooksToCollection).not.toHaveBeenCalled();
	});

	it("keeps the book and says so when joining fails", async () => {
		addBooksToCollection.mockRejectedValueOnce(new Error("disk"));
		await stageAndCommit("c1");
		expect(commitStagedImport).toHaveBeenCalledTimes(1);
		expect(toastError).toHaveBeenCalledWith('Added "Dune", but not to the collection');
		expect(queue.current).toBeNull();
	});
});
