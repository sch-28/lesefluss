// @vitest-environment node
import { wordPos } from "@lesefluss/core";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { addHighlight, getHighlightsByBook, getHighlightsByBooks } = await import(
	"../queries/highlights"
);

function highlight(id: string, bookId: string, startWord: number) {
	return {
		id,
		bookId,
		startWord: wordPos(startWord),
		endWord: wordPos(startWord + 2),
		color: "yellow",
		createdAt: 0,
		updatedAt: 0,
	};
}

beforeEach(() => {
	raw.exec("DELETE FROM highlights");
});

describe("highlight order", () => {
	it("lists a book's highlights by start word, not by when they were made", async () => {
		await addHighlight(highlight("later", "b1", 300));
		await addHighlight(highlight("earlier", "b1", 12));
		await addHighlight(highlight("middle", "b1", 40));
		await addHighlight(highlight("other-book", "b2", 1));

		expect((await getHighlightsByBook("b1")).map((h) => h.id)).toEqual([
			"earlier",
			"middle",
			"later",
		]);
	});

	it("orders by start word within each book across several books", async () => {
		await addHighlight(highlight("b2-late", "b2", 90));
		await addHighlight(highlight("b1-late", "b1", 50));
		await addHighlight(highlight("b2-early", "b2", 5));
		await addHighlight(highlight("b1-early", "b1", 7));

		expect((await getHighlightsByBooks(["b1", "b2"])).map((h) => h.id)).toEqual([
			"b1-early",
			"b1-late",
			"b2-early",
			"b2-late",
		]);
	});
});
