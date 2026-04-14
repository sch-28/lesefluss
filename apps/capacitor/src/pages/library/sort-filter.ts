import type { Book } from "../../services/db/schema";

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
