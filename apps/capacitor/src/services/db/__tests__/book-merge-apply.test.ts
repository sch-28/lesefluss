// @vitest-environment node
import { type SyncBook, wordPos } from "@lesefluss/core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { applyBookMerge, getBooksForSync, updateBook } = await import("../queries/books");
const { buildBookMergeUpdate } = await import("../../sync/book-merge");

type Row = {
	word_position: number;
	updated_at: number;
	last_read: number | null;
	rating: number | null;
	metadata_updated_at: number;
	added_at: number;
};

function row(): Row {
	return raw
		.prepare(
			"SELECT word_position, updated_at, last_read, rating, metadata_updated_at, added_at FROM books WHERE id = 'b1'",
		)
		.get() as Row;
}

beforeEach(() => {
	raw.exec("DELETE FROM books");
	raw
		.prepare(
			`INSERT INTO books (id, title, file_format, size, word_position, word_count, is_active, added_at, deleted, updated_at, metadata_updated_at, last_read, rating)
			 VALUES ('b1', 'Book', 'epub', 1, 100, 1000, 0, 500, 0, 1000, 1000, 1000, 3)`,
		)
		.run();
});

function serverBook(overrides: Partial<SyncBook>): SyncBook {
	return {
		bookId: "b1",
		title: "Book",
		author: null,
		fileSize: 1,
		wordCount: 1000,
		wordPosition: 100,
		chapterStatus: "fetched",
		deleted: false,
		updatedAt: 1000,
		metadataUpdatedAt: 1000,
		addedAt: 500,
		...overrides,
	};
}

/** The pull's decision, made on the row as read before the fetch, as `pullSync` does. */
async function decideMerge(server: SyncBook) {
	const snapshot = (await getBooksForSync()).find((b) => b.id === "b1");
	if (!snapshot) throw new Error("no local row");
	const update = buildBookMergeUpdate(snapshot, server);
	if (!update) throw new Error("expected a merge");
	return update;
}

describe("applyBookMerge", () => {
	it("adopts a newer server position when nothing changed since the snapshot", async () => {
		const server = serverBook({ wordPosition: 200, updatedAt: 2000 });
		await applyBookMerge("b1", await decideMerge(server), server.updatedAt);
		expect(row()).toMatchObject({ word_position: 200, updated_at: 2000, last_read: 2000 });
	});

	it("keeps a position the reader saved between the snapshot and the merge", async () => {
		const server = serverBook({ wordPosition: 200, updatedAt: 2000 });
		const update = await decideMerge(server);
		await updateBook("b1", { wordPosition: wordPos(300), lastRead: 3000 }, 3000);
		await applyBookMerge("b1", update, server.updatedAt);
		expect(row()).toMatchObject({ word_position: 300, updated_at: 3000, last_read: 3000 });
	});

	it("keeps a local position saved meanwhile with the same stamp as the server's", async () => {
		const server = serverBook({ wordPosition: 200, updatedAt: 2000 });
		const update = await decideMerge(server);
		await updateBook("b1", { wordPosition: wordPos(300), lastRead: 2000 }, 2000);
		await applyBookMerge("b1", update, server.updatedAt);
		expect(row()).toMatchObject({ word_position: 300, updated_at: 2000 });
	});

	it("still applies newer metadata and an earlier add date when the position is kept", async () => {
		const server = serverBook({
			wordPosition: 200,
			updatedAt: 2000,
			metadataUpdatedAt: 2000,
			rating: 4,
			addedAt: 400,
		});
		const update = await decideMerge(server);
		await updateBook("b1", { wordPosition: wordPos(300), lastRead: 3000 }, 3000);
		await applyBookMerge("b1", update, server.updatedAt);
		expect(row()).toMatchObject({
			word_position: 300,
			rating: 4,
			metadata_updated_at: 2000,
			added_at: 400,
		});
	});

	it("keeps metadata edited between the snapshot and the merge", async () => {
		const server = serverBook({ metadataUpdatedAt: 2000, rating: 4 });
		const update = await decideMerge(server);
		await updateBook("b1", { rating: 2 }, 3000);
		await applyBookMerge("b1", update, server.updatedAt);
		expect(row()).toMatchObject({ rating: 2, metadata_updated_at: 3000 });
	});

	it("keeps an add date that moved earlier than the server's meanwhile", async () => {
		const server = serverBook({ addedAt: 400 });
		const update = await decideMerge(server);
		raw.exec("UPDATE books SET added_at = 300 WHERE id = 'b1'");
		await applyBookMerge("b1", update, server.updatedAt);
		expect(row().added_at).toBe(300);
	});

	it("refuses, in development, a field it has no stamp to guard with", async () => {
		const unrouted = { finishedAt: 2000 } as unknown as Parameters<typeof applyBookMerge>[1];
		await expect(applyBookMerge("b1", unrouted, 2000)).rejects.toThrow(/finishedAt/);
	});
});
