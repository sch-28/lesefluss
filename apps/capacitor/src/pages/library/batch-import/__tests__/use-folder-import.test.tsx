import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, type Rendered, render } from "../../../../test/render";

const files = [
	{ id: "f1", name: "a.epub", path: "a.epub" },
	{ id: "f2", name: "b.epub", path: "b.epub" },
];
let scanFiles: typeof files = files;
let pickerKind: "folder" | "files" = "folder";
let scanError: Error | null = null;
const toastWarning = vi.fn();
const appendBooksToCollection = vi.fn(async (_id: string, _bookIds: string[]) => {});
const toastError = vi.fn();
let releaseProbes: () => void = () => {};
let probesDone = Promise.resolve();

vi.mock("../../../../services/book-import", () => ({
	batchPickerKind: () => pickerKind,
	pickBookFolder: async () => {
		if (scanError) throw scanError;
		return { files: scanFiles, truncated: false };
	},
	probeScannedFile: async (file: { name: string }) => {
		await probesDone;
		return {
			title: file.name.replace(".epub", ""),
			author: null,
			coverImage: null,
			format: "epub",
		};
	},
	importScannedFile: async (file: { id: string }) => ({ id: `book-${file.id}` }),
}));
vi.mock("../../../../services/db/queries/collections", () => ({
	appendBooksToCollection: (id: string, bookIds: string[]) => appendBooksToCollection(id, bookIds),
}));
vi.mock("../../../../services/sync", () => ({ scheduleSyncPush: () => {} }));
vi.mock("../../../../components/toast", () => ({
	toast: { error: (m: string) => toastError(m), warning: (m: string) => toastWarning(m) },
}));

const { useFolderImport } = await import("../use-folder-import");

let hook: ReturnType<typeof useFolderImport>;
let rendered: Rendered;
const NO_TITLES: ReadonlySet<string> = new Set();
const onClose = () => {};

const Probe = ({
	target,
	titles = NO_TITLES,
}: {
	target?: string;
	titles?: ReadonlySet<string>;
}) => {
	hook = useFolderImport(titles, onClose, target);
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
	probesDone = Promise.resolve();
	scanFiles = files;
	pickerKind = "folder";
	scanError = null;
	appendBooksToCollection.mockReset();
	toastError.mockClear();
	toastWarning.mockClear();
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

describe("useFolderImport while files are checked", () => {
	it("imports nothing until every file is checked, and leaves duplicates unticked", async () => {
		probesDone = new Promise((resolve) => {
			releaseProbes = resolve;
		});
		rendered = await render(<Probe titles={new Set(["b"])} />);
		await act(async () => hook.start());
		await flush();
		expect(hook.pendingProbes).toBe(2);
		await act(async () => hook.beginImport());
		expect(hook.phase).toBe("review");

		act(() => hook.selectAll(true));
		expect(hook.candidates.map((c) => c.selected)).toEqual([true, false]);

		await act(async () => releaseProbes());
		await flush();
		expect(hook.pendingProbes).toBe(0);
		expect(hook.candidates.map((c) => c.selected)).toEqual([true, false]);
		await act(async () => hook.beginImport());
		await flush();
		expect(hook.result?.imported).toBe(1);
	});
});

describe("useFolderImport wording", () => {
	it("talks about a folder where the picker opens one", async () => {
		scanFiles = [];
		rendered = await render(<Probe />);
		expect(hook.copy.scanning).toBe("Scanning folder…");
		await act(async () => hook.start());
		expect(toastWarning).toHaveBeenCalledWith("No books found in that folder");
	});

	it("talks about files where the picker selects several files", async () => {
		pickerKind = "files";
		scanFiles = [];
		rendered = await render(<Probe />);
		expect(hook.copy.scanning).toBe("Reading files…");
		await act(async () => hook.start());
		expect(toastWarning).toHaveBeenCalledWith("None of those files is a book");
	});

	it("says the files could not be read when the multi-file scan fails", async () => {
		pickerKind = "files";
		scanError = new Error("disk gone");
		rendered = await render(<Probe />);
		await act(async () => hook.start());
		expect(toastError).toHaveBeenCalledWith("Couldn't read those files");
	});
});
