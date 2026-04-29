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

function applyFilter(books: Book[], filterBy: FilterBy): Book[] {
	switch (filterBy) {
		case "unread":
			return books.filter((b) => readingProgress(b) === 0);
		case "reading":
			return books.filter((b) => {
				const p = readingProgress(b);
				return p > 0 && p < 95;
			});
		case "done":
			return books.filter((b) => readingProgress(b) >= 95);
		default:
			return books;
	}
}

function applySort(books: Book[], sortBy: SortBy): Book[] {
	return [...books].sort((a, b) => {
		switch (sortBy) {
			case "title":
				return a.title.localeCompare(b.title);
			case "author":
				return (a.author ?? "").localeCompare(b.author ?? "");
			case "recent":
				return (b.lastRead ?? b.addedAt) - (a.lastRead ?? a.addedAt);
			case "progress":
				return readingProgress(b) - readingProgress(a);
			default:
				return 0;
		}
	});
}

export function filterAndSort(books: Book[], filterBy: FilterBy, sortBy: SortBy): Book[] {
	return applySort(applyFilter(books, filterBy), sortBy);
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

function applySeriesFilter(
	list: Series[],
	filterBy: FilterBy,
	activity: Map<string, SeriesActivity>,
): Series[] {
	switch (filterBy) {
		case "unread":
			// No chapter started yet. A zero-chapter series (rare placeholder state
			// before the first TOC poll completes) also counts as unread.
			return list.filter((s) => (activity.get(s.id)?.started ?? 0) === 0);
		case "reading":
			return list.filter((s) => {
				const a = activity.get(s.id);
				if (!a || a.total === 0) return false;
				return a.started > 0 && a.finished < a.total;
			});
		case "done":
			return list.filter((s) => {
				const a = activity.get(s.id);
				return !!a && a.total > 0 && a.finished >= a.total;
			});
		default:
			return list;
	}
}

function applySeriesSort(
	list: Series[],
	sortBy: SortBy,
	activity: Map<string, SeriesActivity>,
): Series[] {
	return [...list].sort((a, b) => {
		switch (sortBy) {
			case "title":
				return a.title.localeCompare(b.title);
			case "author":
				return (a.author ?? "").localeCompare(b.author ?? "");
			case "recent":
				return seriesRecency(b, activity.get(b.id)) - seriesRecency(a, activity.get(a.id));
			case "progress":
				return seriesProgress(activity.get(b.id)) - seriesProgress(activity.get(a.id));
			default:
				return 0;
		}
	});
}

export function filterAndSortSeries(
	list: Series[],
	filterBy: FilterBy,
	sortBy: SortBy,
	activity: Map<string, SeriesActivity>,
): Series[] {
	return applySeriesSort(applySeriesFilter(list, filterBy, activity), sortBy, activity);
}
