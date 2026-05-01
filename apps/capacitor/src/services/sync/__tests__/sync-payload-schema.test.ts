import { type SyncBook, SyncPayloadSchema } from "@lesefluss/core";
import { describe, expect, it } from "vitest";

function chapterRow(i: number): SyncBook {
	const id = i.toString(16).padStart(8, "0");
	return {
		bookId: id,
		title: `Chapter ${i}`,
		author: null,
		fileSize: 0,
		wordCount: null,
		position: 0,
		seriesId: "9d95aaa3",
		chapterIndex: i,
		chapterSourceUrl: `https://example.com/c/${i}`,
		chapterStatus: "fetched",
		deleted: false,
		updatedAt: 1700000000000,
	};
}

describe("SyncPayloadSchema (TASK-102 regression)", () => {
	it("accepts a 13k-row payload of chapter-only books", () => {
		const books = Array.from({ length: 13_000 }, (_, i) => chapterRow(i));
		const result = SyncPayloadSchema.safeParse({
			books,
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
		});
		expect(result.success).toBe(true);
	});

	it("rejects payloads above the 50k books cap", () => {
		const books = Array.from({ length: 50_001 }, (_, i) => chapterRow(i));
		const result = SyncPayloadSchema.safeParse({
			books,
			settings: null,
			highlights: [],
			glossaryEntries: [],
			series: [],
		});
		expect(result.success).toBe(false);
	});
});
