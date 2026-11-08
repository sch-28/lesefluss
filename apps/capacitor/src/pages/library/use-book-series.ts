import { useMemo } from "react";
import { queryHooks } from "../../services/db/hooks";
import type { CollectionWithCount, SeriesMembership } from "../../services/db/queries/collections";
import { type SeriesSuggestion, suggestAuthorSeries } from "./author-series-suggestion";

export type BookSeries = { collectionId: string; name: string; index: number | null };

/** The series a card's badge shows: the book's first series collection in sidebar order. */
export function bookSeriesOf(
	memberships: readonly SeriesMembership[] | undefined,
	collections: readonly CollectionWithCount[],
): BookSeries | null {
	for (const { collectionId, seriesIndex } of memberships ?? []) {
		const collection = collections.find((c) => c.id === collectionId);
		if (collection) return { collectionId, name: collection.name, index: seriesIndex };
	}
	return null;
}

export function useBookSeries(bookId: string): BookSeries | null {
	const memberships = queryHooks.useSeriesMemberships().data;
	const { data: collections = [] } = queryHooks.useCollections();
	return bookSeriesOf(memberships?.get(bookId), collections);
}

/** A series by the same author for a book in none; `bookId` is "" for a book not yet imported. */
export function useAuthorSeriesSuggestion(
	bookId: string,
	author: string | null,
): SeriesSuggestion | null {
	const memberships = queryHooks.useSeriesMemberships().data;
	const { data: collections } = queryHooks.useCollections();
	const books = queryHooks.useBooks().data?.books;
	return useMemo(
		() =>
			memberships && collections && books
				? suggestAuthorSeries({ id: bookId, author }, books, memberships, collections)
				: null,
		[bookId, author, memberships, collections, books],
	);
}
