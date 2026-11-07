import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, type Rendered, render } from "../../../../test/render";

const files = [
	{ id: "f1", name: "a.epub", path: "a.epub" },
	{ id: "f2", name: "b.epub", path: "b.epub" },
];
const appendBooksToCollection = vi.fn(async (_id: string, _bookIds: string[]) => {});
const toastError = vi.fn();

vi.mock("../../../../services/book-import", () => ({
	pickBookFolder: async () => ({ files, truncated: false }),
	probeScannedFile: async () => new Promise(() => {}),
	importScannedFile: async (file: { id: string }) => ({ id: `book-${file.id}` }),
}));
vi.mock("../../../../services/db/queries/collections", () => ({
	appendBooksToCollection: (id: string, bookIds: string[]) => appendBooksToCollection(id, bookIds),
}));
vi.mock("../../../../services/sync", () => ({ scheduleSyncPush: () => {} }));
vi.mock("../../../../components/toast", () => ({
	toast: { error: (m: string) => toastError(m), warning: () => {} },
}));

const { useFolderImport } = await import("../use-folder-import");

let hook: ReturnType<typeof useFolderImport>;
let rendered: Rendered;
const NO_TITLES: ReadonlySet<string> = new Set();
const onClose = () => {};

const Probe = ({ target }: { target?: string }) => {
	hook = useFolderImport(NO_TITLES, onClose, target);
	return null;
};

async function importFolder(target?: string) {
	rendered = await render(<Probe target={target} />);
	await act(async () => hook.start());
	await flush();
	await act(async () => hook.beginImport());
	await flush();
}

beforeEach(() => {
	appendBooksToCollection.mockReset();
	toastError.mockClear();
});
afterEach(() => rendered.unmount());

describe("useFolderImport into a collection", () => {
	it("adds every imported book to the target collection", async () => {
		await importFolder("c1");
		expect(appendBooksToCollection.mock.calls).toEqual([
			["c1", ["book-f1"]],
			["c1", ["book-f2"]],
		]);
		expect(hook.result?.imported).toBe(2);
	});

	it("still counts a book imported when it can't join", async () => {
		appendBooksToCollection.mockRejectedValueOnce(new Error("disk"));
		await importFolder("c1");
		expect(hook.result).toMatchObject({ imported: 2, failures: [] });
		expect(toastError).toHaveBeenCalledWith("1 book couldn't be added to the collection");
	});

	it("joins nothing without a target", async () => {
		await importFolder();
		expect(hook.result?.imported).toBe(2);
		expect(appendBooksToCollection).not.toHaveBeenCalled();
	});
});
