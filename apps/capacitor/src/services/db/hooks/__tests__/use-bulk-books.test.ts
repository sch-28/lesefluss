import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Book } from "../../schema";
import { describeBulkError, runFor } from "../use-bulk-books";

const removeBook = vi.hoisted(() => vi.fn());
const updateBook = vi.hoisted(() => vi.fn());
const getBook = vi.hoisted(() => vi.fn());

vi.mock("../../../book-import", () => ({ removeBook }));
vi.mock("../../queries", () => ({ queries: { updateBook, getBook } }));

function book(over: Partial<Book> = {}): Book {
	return { id: "b1", title: "Dune", filePath: "books/b1.epub", status: null, ...over } as Book;
}

beforeEach(() => {
	removeBook.mockReset();
	updateBook.mockReset();
	// Default: the row on disk matches the one the selection was built from.
	getBook.mockReset();
	getBook.mockImplementation(async () => undefined);
});

describe("runFor delete", () => {
	it("removes the row and the file it came from", async () => {
		await runFor({ kind: "delete" })(book());
		expect(removeBook).toHaveBeenCalledWith({ id: "b1", filePath: "books/b1.epub" });
	});
});

describe("runFor status", () => {
	it("writes the new status", async () => {
		await runFor({ kind: "status", status: "finished" })(book({ status: "reading" }));
		expect(updateBook).toHaveBeenCalledWith("b1", { status: "finished" });
	});

	it("clears a status", async () => {
		await runFor({ kind: "status", status: null })(book({ status: "reading" }));
		expect(updateBook).toHaveBeenCalledWith("b1", { status: null });
	});

	// Every write stamps `metadataUpdatedAt`, and sync merges the whole editable
	// group behind that one stamp — so a pointless write here would push a stale
	// rating or review over a newer edit made on another device.
	it("skips a book already at that status", async () => {
		await runFor({ kind: "status", status: "finished" })(book({ status: "finished" }));
		expect(updateBook).not.toHaveBeenCalled();
	});

	it("skips a book that already has no status when clearing", async () => {
		await runFor({ kind: "status", status: null })(book({ status: null }));
		expect(updateBook).not.toHaveBeenCalled();
	});
});

describe("runFor reads the row before patching", () => {
	// A sync pull can land mid-run. Patching the snapshot the selection was built
	// from would overwrite what the pull just brought in, and re-stamp it, so the
	// remote edit would lose on the next push.
	it("skips a book the pull already moved to the target status", async () => {
		getBook.mockResolvedValue(book({ status: "finished" }));
		await runFor({ kind: "status", status: "finished" })(book({ status: "reading" }));
		expect(updateBook).not.toHaveBeenCalled();
	});

	it("writes a book the pull moved away from the target status", async () => {
		getBook.mockResolvedValue(book({ status: "reading" }));
		await runFor({ kind: "status", status: "finished" })(book({ status: "finished" }));
		expect(updateBook).toHaveBeenCalledWith("b1", { status: "finished" });
	});

	it("patches tags from the freshly read row", async () => {
		getBook.mockResolvedValue(book({ tags: JSON.stringify(["fresh"]) }));
		const seen: (string | null)[] = [];
		await runFor({
			kind: "tags",
			patch: (b) => {
				seen.push(b.tags);
				return { kind: "unchanged" };
			},
		})(book({ tags: JSON.stringify(["stale"]) }));
		expect(seen).toEqual([JSON.stringify(["fresh"])]);
	});

	// A book deleted between building the selection and reaching it.
	it("falls back to the captured row when the book is gone", async () => {
		getBook.mockResolvedValue(undefined);
		await runFor({ kind: "status", status: "finished" })(book({ status: "reading" }));
		expect(updateBook).toHaveBeenCalledWith("b1", { status: "finished" });
	});
});

describe("runFor tags", () => {
	it("writes the patched tags", async () => {
		await runFor({ kind: "tags", patch: () => ({ kind: "write", tags: '["a"]' }) })(book());
		expect(updateBook).toHaveBeenCalledWith("b1", { tags: '["a"]' });
	});

	it("skips a book that already matches", async () => {
		await runFor({ kind: "tags", patch: () => ({ kind: "unchanged" }) })(book());
		expect(updateBook).not.toHaveBeenCalled();
	});

	// Overflow must be reported, never written half-applied.
	it("throws without writing when the book cannot take the tag", async () => {
		await expect(
			runFor({ kind: "tags", patch: () => ({ kind: "overflow" }) })(book()),
		).rejects.toThrow("TAGS_FULL");
		expect(updateBook).not.toHaveBeenCalled();
	});
});

describe("describeBulkError", () => {
	// A reader who confirmed a delete must not be told an update failed.
	it("uses the wording of the action that failed", () => {
		expect(describeBulkError("delete")).toBe("Couldn't delete this book");
		expect(describeBulkError("status")).toBe("Couldn't update this book");
	});

	it("names the tag cap when that is why a book failed", () => {
		expect(describeBulkError("tags", new Error("TAGS_FULL"))).toBe("Too many tags on this book");
	});
});
