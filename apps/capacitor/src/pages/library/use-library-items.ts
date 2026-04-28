import { queryHooks } from "../../services/db/hooks";
import type { Book, Series } from "../../services/db/schema";

type UseLibraryItems = {
	books: Book[];
	series: Series[];
	covers: Map<string, string>;
	/** Map<seriesId, chapterCount> — drives the "N chapters" badge on each SeriesCard. */
	chapterCounts: Map<string, number>;
	isLoading: boolean;
};

/**
 * Single source for the library grid. Composes:
 *
 *   useBooks()                  — standalone books (chapter rows already filtered out
 *                                 by `getBooks()` itself; only books with `seriesId IS NULL`)
 *   useSeriesList()             — imported serials (excludes tombstones)
 *   useSeriesChapterCounts()    — one batched COUNT(*) per series for the badges
 *
 * The library page passes each `<SeriesCard>` its own `chapterCount` from the
 * map — N+1 free.
 */
export function useLibraryItems(): UseLibraryItems {
	const books = queryHooks.useBooks();
	const series = queryHooks.useSeriesList();
	const counts = queryHooks.useSeriesChapterCounts();

	return {
		books: books.data?.books ?? [],
		series: series.data ?? [],
		covers: books.data?.covers ?? new Map(),
		chapterCounts: counts.data ?? new Map(),
		isLoading: books.isPending || series.isPending,
	};
}
