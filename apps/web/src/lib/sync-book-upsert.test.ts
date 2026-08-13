import type { SyncBook } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { claimsMetadata } from "./sync-book-upsert";

function makeBook(overrides: Partial<SyncBook> = {}): SyncBook {
	return {
		bookId: "deadbeef",
		title: "T",
		author: null,
		fileSize: 0,
		wordCount: 0,
		wordPosition: 0,
		chapterStatus: "fetched",
		deleted: false,
		updatedAt: 1000,
		...overrides,
	};
}

// Which merge rules a push gets hangs entirely on this answer, and the
// integration tests that cover the consequence need a database.
describe("claimsMetadata", () => {
	it("is false for a payload from a client that pre-dates the columns", () => {
		expect(claimsMetadata(makeBook())).toBe(false);
	});

	it("is true when the reader cleared a value, which is not the same as never having one", () => {
		expect(claimsMetadata(makeBook({ rating: null }))).toBe(true);
		expect(claimsMetadata(makeBook({ description: null }))).toBe(true);
	});

	it("is true for a set value", () => {
		expect(claimsMetadata(makeBook({ status: "dropped" }))).toBe(true);
	});

	it("is true when only one of the six is present", () => {
		for (const field of [
			"description",
			"language",
			"status",
			"rating",
			"review",
			"tags",
		] as const) {
			expect(claimsMetadata(makeBook({ [field]: null }))).toBe(true);
		}
	});
});
