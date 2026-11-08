import { bookStatus, type FeedItem } from "@lesefluss/core";
import { type CatalogSearchResult, catalogSource } from "../../services/catalog/client";
import { collapseEditions, editionKey } from "./editions";

type LibraryBook = {
	title: string;
	author: string | null;
	catalogId: string | null;
	lastRead: number | null;
	wordCount: number;
	wordPosition: number;
	status: string | null;
	finishedAt?: number | null;
	firstSittingAt: number | null;
};

const MAX_AUTHORS = 3;

/**
 * The library book the catalog knows that the reader really read last: on the
 * Reading or Finished shelf (`bookStatus`), most recently read first. A book
 * only added or opened is not one "you read".
 */
export function pickSeedBook<T extends LibraryBook>(
	books: readonly T[],
): (T & { catalogId: string }) | null {
	let best: (T & { catalogId: string }) | null = null;
	for (const b of books) {
		if (!b.catalogId || b.lastRead == null) continue;
		const status = bookStatus(b);
		if (status !== "reading" && status !== "finished") continue;
		if (!best || b.lastRead > (best.lastRead ?? 0)) best = { ...b, catalogId: b.catalogId };
	}
	return best;
}

/** Up to three authors from the library, most recently read first, case-insensitively distinct. */
export function pickAuthors(books: readonly LibraryBook[]): string[] {
	const sorted = [...books].sort((a, b) => (b.lastRead ?? 0) - (a.lastRead ?? 0));
	const seen = new Set<string>();
	const authors: string[] = [];
	for (const b of sorted) {
		const author = b.author?.trim();
		if (!author || seen.has(author.toLowerCase())) continue;
		seen.add(author.toLowerCase());
		authors.push(author);
		if (authors.length === MAX_AUTHORS) break;
	}
	return authors;
}

/**
 * Drop what the reader already has: the same catalog id, or another edition of
 * a work they own (keys from `editionKey`), plus duplicate editions in `results`.
 */
export function excludeOwned(
	results: readonly CatalogSearchResult[],
	ownedCatalogIds: ReadonlySet<string>,
	ownedEditions: ReadonlySet<string> = new Set(),
): CatalogSearchResult[] {
	return collapseEditions(results).filter(
		(r) => !ownedCatalogIds.has(r.id) && !ownedEditions.has(editionKey(r.title, r.author)),
	);
}

/**
 * Catalog books from friends' activity, newest first. The server only returns
 * events the friend's visibility settings allow, so this never widens them.
 */
export function friendsReading(
	items: readonly FeedItem[],
	ownedCatalogIds: ReadonlySet<string>,
	ownedEditions: ReadonlySet<string> = new Set(),
): CatalogSearchResult[] {
	const books: CatalogSearchResult[] = [];
	for (const item of items) {
		const id = item.book.catalogId;
		if (item.isOwn || !id) continue;
		books.push({
			id,
			source: catalogSource(id),
			title: item.book.title,
			author: item.book.author,
			language: null,
			subjects: null,
			summary: null,
			coverUrl: null,
			// The feed doesn't say; false hides quick add rather than offering one that may fail.
			hasEpub: false,
		});
	}
	return excludeOwned(books, ownedCatalogIds, ownedEditions);
}
