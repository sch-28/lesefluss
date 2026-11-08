import { displayAuthor } from "@lesefluss/core";
import { nextSeriesNumber } from "../../components/collections/series-numbering";
import type { CollectionWithCount, SeriesMembership } from "../../services/db/queries/collections";

export type SeriesSuggestion = { collectionId: string; name: string; index: number };

type AuthoredBook = { id: string; author: string | null };

/** "Brown, Pierce" and "pierce  brown" are one author. */
function authorKey(author: string | null | undefined): string {
	return author ? displayAuthor(author).replace(/\s+/g, " ").trim().toLowerCase() : "";
}

/**
 * The series a book with none could join: the series holding the most other
 * books by its author (the first in sidebar order on a tie), with the number
 * after that series' highest.
 */
export function suggestAuthorSeries(
	book: AuthoredBook,
	books: readonly AuthoredBook[],
	memberships: ReadonlyMap<string, readonly SeriesMembership[]>,
	collections: readonly CollectionWithCount[],
): SeriesSuggestion | null {
	if (memberships.get(book.id)?.length) return null;
	const author = authorKey(book.author);
	if (!author) return null;
	const byAuthor = new Set(
		books.filter((b) => b.id !== book.id && authorKey(b.author) === author).map((b) => b.id),
	);
	if (byAuthor.size === 0) return null;

	const members = new Map<string, Map<string, number | null>>();
	for (const [bookId, list] of memberships) {
		if (bookId === book.id) continue;
		for (const { collectionId, seriesIndex } of list) {
			const series = members.get(collectionId) ?? new Map<string, number | null>();
			series.set(bookId, seriesIndex);
			members.set(collectionId, series);
		}
	}

	let best: { collection: CollectionWithCount; hits: number } | null = null;
	for (const collection of collections) {
		const series = members.get(collection.id);
		if (!series) continue;
		let hits = 0;
		for (const id of series.keys()) if (byAuthor.has(id)) hits++;
		if (hits > (best?.hits ?? 0)) best = { collection, hits };
	}
	if (!best) return null;
	const series = members.get(best.collection.id) ?? new Map();
	return {
		collectionId: best.collection.id,
		name: best.collection.name,
		index: nextSeriesNumber(series),
	};
}
