import type { SyncBook } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import {
	claimsMetadata,
	claimsSeries,
	groupBooksByMergeRules,
	withFirstSittings,
} from "./sync-book-upsert";

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

describe("claimsSeries", () => {
	it("is false for a payload without the series fields, even one claiming metadata", () => {
		expect(claimsSeries(makeBook())).toBe(false);
		expect(claimsSeries(makeBook({ status: "reading", hideFromProfile: true }))).toBe(false);
	});

	it("is true when any series field is present, a cleared one included", () => {
		expect(claimsSeries(makeBook({ seriesName: null }))).toBe(true);
		expect(claimsSeries(makeBook({ seriesIndex: 2.5 }))).toBe(true);
		expect(claimsSeries(makeBook({ seriesUpdatedAt: 0 }))).toBe(true);
	});

	it("is not part of the metadata claim", () => {
		expect(claimsMetadata(makeBook({ seriesName: "Dune", seriesUpdatedAt: 1 }))).toBe(false);
	});

	it("splits a push so a book without series fields never shares the claiming merge", () => {
		const groups = groupBooksByMergeRules([
			makeBook({ bookId: "a", seriesName: "Dune", seriesUpdatedAt: 1 }),
			makeBook({ bookId: "b" }),
			makeBook({ bookId: "c", seriesName: null, seriesUpdatedAt: 1 }),
		]);
		expect(groups.map((g) => g.map((b) => b.bookId))).toEqual([["a", "c"], ["b"]]);
	});
});

describe("withFirstSittings", () => {
	const session = (bookId: string, startedAt: number, durationMs: number) => ({
		bookId,
		startedAt,
		durationMs,
	});

	it("marks a book from the earliest sitting of a minute or more in the push", () => {
		const [book] = withFirstSittings(
			[makeBook()],
			[session("deadbeef", 300, 60_000), session("deadbeef", 200, 90_000)],
		);
		expect(book.firstSittingAt).toBe(200);
	});

	it("ignores a short sitting, and keeps an earlier marker the book carries", () => {
		expect(
			withFirstSittings([makeBook()], [session("deadbeef", 100, 59_999)])[0].firstSittingAt,
		).toBeUndefined();
		expect(
			withFirstSittings([makeBook({ firstSittingAt: 50 })], [session("deadbeef", 100, 60_000)])[0]
				.firstSittingAt,
		).toBe(50);
	});

	it("leaves books without a sitting in the push alone", () => {
		const [book] = withFirstSittings([makeBook()], [session("other000", 100, 60_000)]);
		expect(book.firstSittingAt).toBeUndefined();
	});
});
