import { type BookStatus, bookStatus, parseBookTags, readingProgress } from "@lesefluss/core";
import type { SeriesActivity } from "../../services/db/queries/series";
import type { Book, Series } from "../../services/db/schema";
import { type FacetValues, facetValuesOf, type LibraryFilter, matchesFilter } from "./filter-model";

export type SortBy = "title" | "author" | "recent" | "progress" | "rating";

export const SORT_LABELS: Record<SortBy, string> = {
	title: "Title",
	author: "Author",
	recent: "Recent",
	progress: "Progress",
	rating: "Rating",
};

export const SORT_OPTIONS: SortBy[] = ["recent", "title", "author", "progress", "rating"];

const FINISHED_TAIL_WORDS = 5;

export function isBookFinished(book: Book): boolean {
	if (book.wordCount <= 0) return false;
	return book.wordPosition >= book.wordCount - FINISHED_TAIL_WORDS;
}

/**
 * Series progress as a 0..100 number, parallel to `readingProgress` for books.
 * Series with no chapters yet (placeholder after import before the first poll)
 * report 0 so they don't get bucketed as "done" by an empty-divide.
 */
export function seriesProgress(activity: SeriesActivity | undefined): number {
	if (!activity || activity.total === 0) return 0;
	return Math.min(100, Math.round((activity.finished / activity.total) * 100));
}

/**
 * "Recent" timestamp for a series. Falls back to the series's own `createdAt`
 * when no chapter has been read yet, so a freshly imported series still
 * surfaces at the top of the recent sort.
 */
function seriesRecency(s: Series, activity: SeriesActivity | undefined): number {
	return activity?.latestRead ?? s.createdAt;
}

/**
 * Series onto the same shelves as books. They carry no `status` column of their
 * own, so this is always derived: a series is what its chapters have done.
 * `dropped` is unreachable here, which is correct - there is nowhere to record
 * that decision about a series yet.
 */
function seriesStatus(activity: SeriesActivity | undefined): BookStatus {
	if (!activity || activity.total === 0) return "want";
	if (activity.finished >= activity.total) return "finished";
	return activity.started > 0 ? "reading" : "want";
}

type SortKey = {
	title: string;
	author: string;
	recency: number;
	progress: number;
	status: BookStatus;
	rating: number | null;
	tags: readonly string[];
};

export type LibraryItem =
	| { kind: "book"; book: Book; sortKey: SortKey; facets: FacetValues }
	| {
			kind: "series";
			series: Series;
			activity: SeriesActivity | undefined;
			sortKey: SortKey;
			facets: FacetValues;
	  };

function bookSortKey(b: Book): SortKey {
	return {
		title: b.title,
		author: b.author ?? "",
		recency: b.lastRead ?? b.addedAt,
		progress: readingProgress(b),
		status: bookStatus(b),
		rating: b.rating,
		tags: parseBookTags(b.tags),
	};
}

function seriesSortKey(s: Series, activity: SeriesActivity | undefined): SortKey {
	return {
		title: s.title,
		author: s.author ?? "",
		recency: seriesRecency(s, activity),
		progress: seriesProgress(activity),
		status: seriesStatus(activity),
		rating: null,
		// Series carry no tags of their own; a tag filter therefore hides them,
		// which is right: they cannot match it.
		tags: [],
	};
}

/** Case-insensitive substring over title and author. Runs against the already
 *  loaded list, so there is no query to debounce. */
function matchesSearch(item: LibraryItem, needle: string): boolean {
	if (!needle) return true;
	const { title, author } = item.sortKey;
	return `${title} ${author}`.toLowerCase().includes(needle);
}

/** Every tag in use across the loaded library, so a tag stops being offered as
 *  soon as the last book carrying it loses it. */
export function tagsInUse(books: Book[]): string[] {
	const seen = new Set<string>();
	for (const book of books) {
		for (const tag of parseBookTags(book.tags)) seen.add(tag);
	}
	return [...seen].sort((a, b) => a.localeCompare(b));
}

function compareItems(a: LibraryItem, b: LibraryItem, sortBy: SortBy): number {
	switch (sortBy) {
		case "title":
			return a.sortKey.title.localeCompare(b.sortKey.title);
		case "author":
			return a.sortKey.author.localeCompare(b.sortKey.author);
		case "recent":
			return b.sortKey.recency - a.sortKey.recency;
		case "progress":
			return b.sortKey.progress - a.sortKey.progress;
		// Unrated sorts below one star rather than above five.
		case "rating":
			return (b.sortKey.rating ?? -1) - (a.sortKey.rating ?? -1);
	}
}

export type LibraryView = {
	filter: LibraryFilter;
	sortBy: SortBy;
	/** Free text over title and author. Empty matches everything. */
	search?: string;
};

/** Every row of the library with its sort and filter fields, built once per library change. */
export function buildLibraryItems(
	books: Book[],
	series: Series[],
	activity: Map<string, SeriesActivity>,
	now = Date.now(),
): LibraryItem[] {
	return [
		...books.map<LibraryItem>((book) => {
			const sortKey = bookSortKey(book);
			const facets = facetValuesOf(
				{
					...sortKey,
					seriesId: null,
					addedAt: book.addedAt,
					lastRead: book.lastRead,
				},
				now,
			);
			return { kind: "book", book, sortKey, facets };
		}),
		...series.map<LibraryItem>((s) => {
			const a = activity.get(s.id);
			const sortKey = seriesSortKey(s, a);
			const facets = facetValuesOf(
				{
					...sortKey,
					seriesId: s.id,
					addedAt: s.createdAt,
					lastRead: a?.latestRead ?? null,
				},
				now,
			);
			return { kind: "series", series: s, activity: a, sortKey, facets };
		}),
	];
}

export function applyLibraryView(items: readonly LibraryItem[], view: LibraryView): LibraryItem[] {
	const { filter, sortBy, search = "" } = view;
	const needle = search.trim().toLowerCase();
	return items
		.filter((it) => matchesFilter(it.facets, filter) && matchesSearch(it, needle))
		.sort((a, b) => compareItems(a, b, sortBy));
}

export function filterAndSortLibrary(
	books: Book[],
	series: Series[],
	activity: Map<string, SeriesActivity>,
	view: LibraryView,
	now = Date.now(),
): LibraryItem[] {
	return applyLibraryView(buildLibraryItems(books, series, activity, now), view);
}
