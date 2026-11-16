// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { fillEmptyBookSeries, getSeriesBackfillCandidates } = await import("../queries/books");

function insertBook(id: string, overrides: Record<string, string | number | null> = {}) {
	const row = {
		id,
		title: "Book",
		file_format: "epub",
		file_path: `books/${id}.epub`,
		size: 1,
		word_position: 3,
		word_count: 10,
		is_active: 0,
		added_at: 500,
		deleted: 0,
		updated_at: 1000,
		metadata_updated_at: 1000,
		series_updated_at: 0,
		...overrides,
	};
	const keys = Object.keys(row);
	raw
		.prepare(`INSERT INTO books (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
		.run(...Object.values(row));
}

function readBook(id: string) {
	return raw
		.prepare(
			"SELECT title, series_name, series_index, series_updated_at, updated_at, metadata_updated_at FROM books WHERE id = ?",
		)
		.get(id);
}

beforeEach(() => {
	raw.exec("DELETE FROM books;");
});

describe("getSeriesBackfillCandidates", () => {
	it("lists only stored EPUBs with an empty series, in id order after the cursor", async () => {
		insertBook("c");
		insertBook("a");
		insertBook("b");
		insertBook("named", { series_name: "Dune" });
		insertBook("numbered", { series_index: 2 });
		insertBook("txt", { file_format: "txt" });
		insertBook("nofile", { file_path: null });
		insertBook("gone", { deleted: 1 });
		insertBook("cleared", { series_updated_at: 5 });

		expect(await getSeriesBackfillCandidates(null, 10)).toEqual([
			{ id: "a", filePath: "books/a.epub" },
			{ id: "b", filePath: "books/b.epub" },
			{ id: "c", filePath: "books/c.epub" },
		]);
		expect((await getSeriesBackfillCandidates("a", 1)).map((b) => b.id)).toEqual(["b"]);
	});
});

describe("fillEmptyBookSeries", () => {
	it("fills an empty series and moves only the series stamp", async () => {
		insertBook("a");
		await fillEmptyBookSeries("a", { seriesName: "Red Rising", seriesIndex: 3 });
		const row = readBook("a") as Record<string, unknown>;
		expect(row).toMatchObject({
			title: "Book",
			series_name: "Red Rising",
			series_index: 3,
			updated_at: 1000,
			metadata_updated_at: 1000,
		});
		expect(row.series_updated_at).toBe(1);
	});

	it("leaves a series cleared meanwhile empty", async () => {
		insertBook("a", { series_updated_at: 9 });
		await fillEmptyBookSeries("a", { seriesName: "From file", seriesIndex: 1 });
		expect(readBook("a")).toMatchObject({ series_name: null, series_updated_at: 9 });
	});

	it("leaves a series set meanwhile untouched", async () => {
		insertBook("a", { series_name: "Mine", series_updated_at: 7 });
		insertBook("b", { series_index: 4, series_updated_at: 7 });
		await fillEmptyBookSeries("a", { seriesName: "From file", seriesIndex: 1 });
		await fillEmptyBookSeries("b", { seriesName: "From file", seriesIndex: 1 });
		expect(readBook("a")).toMatchObject({
			series_name: "Mine",
			series_index: null,
			series_updated_at: 7,
		});
		expect(readBook("b")).toMatchObject({
			series_name: null,
			series_index: 4,
			series_updated_at: 7,
		});
	});
});
