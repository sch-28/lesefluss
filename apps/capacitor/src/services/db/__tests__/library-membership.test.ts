// @vitest-environment node
import type { SQLInputValue } from "node:sqlite";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { getLibraryCatalogIds } = await import("../queries/library-membership");

function insertBook(id: string, overrides: Record<string, SQLInputValue> = {}) {
	const row: Record<string, SQLInputValue> = {
		id,
		title: id,
		file_format: "epub",
		size: 1,
		word_position: 0,
		is_active: 0,
		added_at: 0,
		deleted: 0,
		...overrides,
	};
	const keys = Object.keys(row);
	raw
		.prepare(`INSERT INTO books (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
		.run(...Object.values(row));
}

beforeEach(() => {
	raw.exec("DELETE FROM books");
});

describe("getLibraryCatalogIds", () => {
	it("maps every catalog book in the library to its local id", async () => {
		insertBook("b1", { catalog_id: "gutenberg:84" });
		insertBook("b2", { catalog_id: "se:mary-shelley/frankenstein" });
		insertBook("b3");

		const ids = await getLibraryCatalogIds();
		expect([...ids]).toEqual(
			expect.arrayContaining([
				["gutenberg:84", "b1"],
				["se:mary-shelley/frankenstein", "b2"],
			]),
		);
		expect(ids.size).toBe(2);
	});

	it("leaves out deleted books, so a re-add is offered again", async () => {
		insertBook("b1", { catalog_id: "gutenberg:84", deleted: 1 });
		expect((await getLibraryCatalogIds()).size).toBe(0);
	});
});
