import type { SeriesActivity } from "../../services/db/queries/series";
import type { Book, Series } from "../../services/db/schema";

export type SortBy = "title" | "author" | "recent" | "progress";
export type FilterBy = "all" | "unread" | "reading" | "done";

export const SORT_LABELS: Record<SortBy, string> = {
	title: "Title",
	author: "Author",
	recent: "Recent",
	progress: "Progress",
};

export const FILTER_LABELS: Record<FilterBy, string> = {
	all: "All",
	unread: "Unread",
	reading: "Reading",
	done: "Done",
};

export const FILTER_OPTIONS: FilterBy[] = ["all", "unread", "reading", "done"];
export const SORT_OPTIONS: SortBy[] = ["recent", "title", "author", "progress"];

export function readingProgress(book: Book): number {
	if (!book.size || book.size === 0) return 0;
	return Math.min(100, Math.round((book.position / book.size) * 100));
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

type SortKey = { title: string; author: string; recency: number; progress: number };

export type LibraryItem =
	| { kind: "book"; book: Book; sortKey: SortKey }
	| {
			kind: "series";
			series: Series;
			activity: SeriesActivity | undefined;
			sortKey: SortKey;
	  };

function bookSortKey(b: Book): SortKey {
	return {
		title: b.title,
		author: b.author ?? "",
		recency: b.lastRead ?? b.addedAt,
		progress: readingProgress(b),
	};
}

function seriesSortKey(s: Series, activity: SeriesActivity | undefined): SortKey {
	return {
		title: s.title,
		author: s.author ?? "",
		recency: seriesRecency(s, activity),
		progress: seriesProgress(activity),
	};
}

function matchesFilter(item: LibraryItem, filterBy: FilterBy): boolean {
	if (filterBy === "all") return true;
	if (item.kind === "book") {
		const p = item.sortKey.progress;
		if (filterBy === "unread") return p === 0;
		if (filterBy === "reading") return p > 0 && p < 95;
		return p >= 95;
	}
	const a = item.activity;
	if (filterBy === "unread") return (a?.started ?? 0) === 0;
	if (filterBy === "reading") {
		if (!a || a.total === 0) return false;
		return a.started > 0 && a.finished < a.total;
	}
	return !!a && a.total > 0 && a.finished >= a.total;
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
	}
}

export function filterAndSortLibrary(
	books: Book[],
	series: Series[],
	activity: Map<string, SeriesActivity>,
	filterBy: FilterBy,
	sortBy: SortBy,
): LibraryItem[] {
	const items: LibraryItem[] = [
		...books.map<LibraryItem>((book) => ({ kind: "book", book, sortKey: bookSortKey(book) })),
		...series.map<LibraryItem>((s) => {
			const a = activity.get(s.id);
			return { kind: "series", series: s, activity: a, sortKey: seriesSortKey(s, a) };
		}),
	];
	return items
		.filter((it) => matchesFilter(it, filterBy))
		.sort((a, b) => compareItems(a, b, sortBy));
}
