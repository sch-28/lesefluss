import type { FeedItem } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { CatalogSearchResult } from "../../../services/catalog/client";
import { excludeOwned, friendsReading, pickAuthors, pickSeedBook } from "../personal-picks";

const book = (
	title: string,
	over: Partial<{ author: string | null; catalogId: string | null; lastRead: number | null }> = {},
) => ({
	title,
	author: null,
	catalogId: null,
	lastRead: null,
	...over,
});

const result = (id: string): CatalogSearchResult => ({
	id,
	source: "gutenberg",
	title: `Book ${id.split(":")[1]}`,
	author: null,
	language: "en",
	subjects: [],
	summary: null,
	coverUrl: null,
});

const feedItem = (over: Partial<FeedItem> & { catalogId: string | null }): FeedItem =>
	({
		id: `e-${over.catalogId}`,
		type: "started",
		isOwn: false,
		actor: { userId: "u1", handle: "ann", displayName: "Ann" },
		day: "2026-10-01",
		...over,
		book: { title: "T", author: "A", catalogId: over.catalogId, cover: null, rating: null },
	}) as unknown as FeedItem;

describe("pickSeedBook", () => {
	it("takes the most recently read book the catalog knows", () => {
		expect(
			pickSeedBook([
				book("Local import", { lastRead: 300 }),
				book("Older catalog", { catalogId: "gutenberg:1", lastRead: 100 }),
				book("Newer catalog", { catalogId: "gutenberg:2", lastRead: 200 }),
				book("Never opened", { catalogId: "gutenberg:3" }),
			])?.title,
		).toBe("Newer catalog");
	});

	it("falls back to the most recently added catalog book before any has been read", () => {
		expect(
			pickSeedBook([
				{ ...book("Older import", { catalogId: "gutenberg:1" }), addedAt: 100 },
				{ ...book("Fresh import", { catalogId: "gutenberg:2" }), addedAt: 200 },
				{ ...book("Local", { lastRead: 999 }), addedAt: 300 },
			])?.title,
		).toBe("Fresh import");
	});

	it("is null for an empty or uncatalogued library", () => {
		expect(pickSeedBook([])).toBeNull();
		expect(pickSeedBook([book("Local", { lastRead: 1 })])).toBeNull();
	});
});

describe("pickAuthors", () => {
	it("takes up to three distinct authors, most recently read first", () => {
		expect(
			pickAuthors([
				book("a", { author: "Jane Austen", lastRead: 1 }),
				book("b", { author: "Mary Shelley", lastRead: 5 }),
				book("c", { author: "mary shelley", lastRead: 4 }),
				book("d", { author: "Bram Stoker", lastRead: 3 }),
				book("e", { author: "H. G. Wells", lastRead: 2 }),
				book("f", { author: null, lastRead: 9 }),
			]),
		).toEqual(["Mary Shelley", "Bram Stoker", "H. G. Wells"]);
	});
});

describe("excludeOwned", () => {
	it("drops books already in the library and duplicates", () => {
		const owned = new Set(["gutenberg:1"]);
		expect(
			excludeOwned(
				[result("gutenberg:1"), result("gutenberg:2"), result("gutenberg:2")],
				owned,
			).map((r) => r.id),
		).toEqual(["gutenberg:2"]);
	});
});

describe("excludeOwned by edition", () => {
	it("drops other editions of a work the reader owns", () => {
		const owned = new Set(["frankenstein|mary shelley"]);
		const gutenbergEdition = {
			...result("gutenberg:84"),
			title: "Frankenstein; Or, The Modern Prometheus",
			author: "Mary Wollstonecraft Shelley",
		};
		const other = {
			...result("gutenberg:18247"),
			title: "The Last Man",
			author: "Mary Wollstonecraft Shelley",
		};
		expect(excludeOwned([gutenbergEdition, other], new Set(), owned).map((r) => r.id)).toEqual([
			"gutenberg:18247",
		]);
	});
});

describe("friendsReading", () => {
	it("keeps friends' catalog books, not the reader's own or non-catalog ones, minus the library", () => {
		const picks = friendsReading(
			[
				feedItem({ catalogId: "se:a/b" }),
				feedItem({ catalogId: "gutenberg:1", isOwn: true }),
				feedItem({ catalogId: null }),
				feedItem({ catalogId: "gutenberg:2" }),
				feedItem({ catalogId: "se:a/b" }),
			],
			new Set(["gutenberg:2"]),
		);
		expect(picks.map((p) => [p.id, p.source])).toEqual([["se:a/b", "standard_ebooks"]]);
	});
});
