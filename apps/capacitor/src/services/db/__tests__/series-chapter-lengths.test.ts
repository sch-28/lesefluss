// @vitest-environment node
import { afterAll, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const { getSeriesChapterLengths } = await import("../queries/series");

function insertChapter(id: string, overrides: Record<string, string | number | null>) {
	const row = {
		id,
		title: "Chapter",
		size: 1,
		word_position: 0,
		word_count: 1000,
		is_active: 0,
		added_at: 500,
		deleted: 0,
		updated_at: 1000,
		...overrides,
	};
	const keys = Object.keys(row);
	raw
		.prepare(`INSERT INTO books (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`)
		.run(...Object.values(row));
}

describe("getSeriesChapterLengths", () => {
	it("groups every live chapter's length and progress by series, in one query", async () => {
		insertChapter("a1", { series_id: "a", word_position: 400, finished_at: null });
		insertChapter("a2", { series_id: "a", word_count: 0 });
		insertChapter("a3", { series_id: "a", deleted: 1 });
		insertChapter("b1", { series_id: "b", word_position: 1000, finished_at: 7 });
		insertChapter("loose", { series_id: null });

		const lengths = await getSeriesChapterLengths();
		expect([...lengths.keys()].sort()).toEqual(["a", "b"]);
		expect(lengths.get("a")).toEqual(
			expect.arrayContaining([
				{ wordCount: 1000, wordPosition: 400, finishedAt: null },
				{ wordCount: 0, wordPosition: 0, finishedAt: null },
			]),
		);
		expect(lengths.get("a")).toHaveLength(2);
		expect(lengths.get("b")).toEqual([{ wordCount: 1000, wordPosition: 1000, finishedAt: 7 }]);
	});
});
