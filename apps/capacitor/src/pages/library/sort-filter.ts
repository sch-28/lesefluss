import {
	BOOK_STATUSES,
	type BookStatus,
	bookPace,
	bookStatus,
	parseBookTags,
	readingProgress,
	type SpeedModel,
} from "@lesefluss/core";
import type { SeriesActivity } from "../../services/db/queries/series";
import type { Book, Series } from "../../services/db/schema";
import { estimateMinutesLeft } from "../../utils/reading-time";
import { type FacetValues, facetValuesOf, type LibraryFilter, matchesFilter } from "./filter-model";
import type { SeriesMemberships } from "./group-by";

export type SortBy =
	| "title"
	| "author"
	| "recent"
	| "progress"
	| "rating"
	| "timeLeft"
	| "status"
	| "words"
	| "added"
	| "lastRead"
	| "series"
	| "tags"
	| "collections"
	| "highlights";

export const SORT_LABELS: Record<SortBy, string> = {
	title: "Title",
	author: "Author",
	recent: "Recent",
	progress: "Progress",
	rating: "Rating",
	timeLeft: "Time left",
	status: "Status",
	words: "Length",
	added: "Date added",
	lastRead: "Last read",
	series: "Series",
	tags: "Tags",
	collections: "Collections",
	highlights: "Highlights",
};

export const SORT_OPTIONS: SortBy[] = [
	"recent",
	"title",
	"author",
	"progress",
	"rating",
	"timeLeft",
	"status",
	"words",
	"added",
	"lastRead",
	"series",
	"tags",
	"collections",
	"highlights",
];

export type SortDir = "asc" | "desc";

/** The direction each sort runs in before the user reverses it. */
export const NATURAL_DIR: Record<SortBy, SortDir> = {
	title: "asc",
	author: "asc",
	recent: "desc",
	progress: "desc",
	rating: "desc",
	timeLeft: "asc",
	status: "asc",
	words: "desc",
	added: "desc",
	lastRead: "desc",
	series: "asc",
	tags: "asc",
	collections: "asc",
	highlights: "desc",
};

export function sortDirection(sortBy: SortBy, reversed: boolean): SortDir {
	const natural = NATURAL_DIR[sortBy];
	if (!reversed) return natural;
	return natural === "asc" ? "desc" : "asc";
}

export const isSortBy = (value: string): value is SortBy =>
	(SORT_OPTIONS as readonly string[]).includes(value);

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
	/** Null when finished or of unknown length, and for a series. */
	minutesLeft: number | null;
	/** Null for a series: its length is its chapters'. */
	words: number | null;
	added: number;
	lastRead: number | null;
	/** The first series the book is in, as the table's Series column shows it. */
	series: { name: string; index: number | null } | null;
	/** The plain (non-series) collections, as the table's Collections column shows them. */
	collections: string | null;
	/** Null for a series, and while the counts are not loaded. */
	highlights: number | null;
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

function bookSortKey(b: Book, model: SpeedModel | undefined): SortKey {
	return {
		title: b.title,
		author: b.author ?? "",
		// A glance saves lastRead too; only a book with a real sitting moves up,
		// and not one put back on Want to read (Reset progress keeps the marker).
		recency: (b.firstSittingAt != null && b.status !== "want" ? b.lastRead : null) ?? b.addedAt,
		progress: readingProgress(b),
		status: bookStatus(b),
		rating: b.rating,
		tags: parseBookTags(b.tags),
		minutesLeft: estimateMinutesLeft(b, bookPace(model, b.id).wpm),
		words: b.wordCount > 0 ? b.wordCount : null,
		added: b.addedAt,
		lastRead: b.lastRead,
		series: null,
		collections: null,
		highlights: null,
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
		minutesLeft: null,
		words: null,
		added: s.createdAt,
		lastRead: activity?.latestRead ?? null,
		series: null,
		collections: null,
		highlights: null,
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
	return [...seen].sort(compareText);
}

/** Numbers inside strings compare as numbers, so "Book 2" sorts before "Book 10". */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function compareText(a: string, b: string): number {
	return collator.compare(a, b);
}

function compareTexts(a: string | null, b: string | null, dir: SortDir): number {
	if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
	const order = collator.compare(a, b);
	return dir === "asc" ? order : -order;
}

/** Missing values go last in either direction: reversing a rating sort must
 *  not bring every unrated book to the top. */
function compareNumbers(a: number | null, b: number | null, dir: SortDir): number {
	if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
	return dir === "asc" ? a - b : b - a;
}

const STATUS_RANK = new Map<BookStatus, number>(BOOK_STATUSES.map((s, i) => [s, i]));

function compareItems(a: LibraryItem, b: LibraryItem, sortBy: SortBy, dir: SortDir): number {
	const ka = a.sortKey;
	const kb = b.sortKey;
	switch (sortBy) {
		case "title":
		case "author": {
			const order = collator.compare(ka[sortBy], kb[sortBy]);
			return dir === "asc" ? order : -order;
		}
		case "recent":
			return compareNumbers(ka.recency, kb.recency, dir);
		case "progress":
			return compareNumbers(ka.progress, kb.progress, dir);
		case "rating":
			return compareNumbers(ka.rating, kb.rating, dir);
		case "timeLeft":
			return compareNumbers(ka.minutesLeft, kb.minutesLeft, dir);
		case "status":
			return compareNumbers(STATUS_RANK.get(ka.status) ?? 0, STATUS_RANK.get(kb.status) ?? 0, dir);
		case "words":
			return compareNumbers(ka.words, kb.words, dir);
		case "added":
			return compareNumbers(ka.added, kb.added, dir);
		case "lastRead":
			return compareNumbers(ka.lastRead, kb.lastRead, dir);
		case "series":
			return (
				compareTexts(ka.series?.name ?? null, kb.series?.name ?? null, dir) ||
				compareNumbers(ka.series?.index ?? null, kb.series?.index ?? null, "asc")
			);
		case "tags":
			return compareTexts(ka.tags.join(", ") || null, kb.tags.join(", ") || null, dir);
		case "collections":
			return compareTexts(ka.collections, kb.collections, dir);
		case "highlights":
			return compareNumbers(ka.highlights, kb.highlights, dir);
	}
}

/** The user's sort: `thenBy` orders what ties on `sortBy`; each key runs its natural
 *  direction unless its own reversed flag is set. */
export function compareByView(
	a: LibraryItem,
	b: LibraryItem,
	sortBy: SortBy,
	thenBy: SortBy | null = null,
	reversed = false,
	thenReversed = false,
): number {
	const first = compareItems(a, b, sortBy, sortDirection(sortBy, reversed));
	if (first !== 0 || !thenBy || thenBy === sortBy) return first;
	return compareItems(a, b, thenBy, sortDirection(thenBy, thenReversed));
}

export type SortState = {
	sortBy: SortBy;
	reversed: boolean;
	thenBy: SortBy | null;
	thenReversed: boolean;
};

export type LibraryView = {
	filter: LibraryFilter;
	sortBy: SortBy;
	thenBy?: SortBy | null;
	/** Runs `sortBy` against its natural direction. */
	reversed?: boolean;
	thenReversed?: boolean;
	/** Free text over title and author. Empty matches everything. */
	search?: string;
};

const NO_COLLECTIONS: readonly string[] = [];

/** Collection names and series numbers, for the series and collections sorts. */
export type ShelfLookup = {
	collections: ReadonlyMap<string, { name: string; seriesKey: string | null }>;
	seriesMemberships: SeriesMemberships;
};

const NO_SHELVES: ShelfLookup = { collections: new Map(), seriesMemberships: new Map() };

function shelfSortFields(
	bookId: string,
	collectionIds: readonly string[],
	shelves: ShelfLookup,
): Pick<SortKey, "series" | "collections"> {
	let series: SortKey["series"] = null;
	for (const { collectionId, seriesIndex } of shelves.seriesMemberships.get(bookId) ?? []) {
		const name = shelves.collections.get(collectionId)?.name;
		if (name) {
			series = { name, index: seriesIndex };
			break;
		}
	}
	const names = collectionIds
		.map((id) => shelves.collections.get(id))
		.filter((c) => c !== undefined && c.seriesKey === null)
		.map((c) => c?.name);
	return { series, collections: names.length > 0 ? names.join(", ") : null };
}

/** Every row of the library with its sort and filter fields, built once per library change.
 *  `collectionsOf` maps a book id to the live collections it is in; `speedModel`
 *  times what is left; `highlightCounts`, once loaded, counts each book's highlights. */
export function buildLibraryItems(
	books: Book[],
	series: Series[],
	activity: Map<string, SeriesActivity>,
	now = Date.now(),
	collectionsOf: ReadonlyMap<string, readonly string[]> = new Map(),
	speedModel?: SpeedModel,
	shelves: ShelfLookup = NO_SHELVES,
	highlightCounts?: ReadonlyMap<string, number>,
): LibraryItem[] {
	return [
		...books.map<LibraryItem>((book) => {
			const collectionIds = collectionsOf.get(book.id) ?? NO_COLLECTIONS;
			const sortKey = {
				...bookSortKey(book, speedModel),
				...shelfSortFields(book.id, collectionIds, shelves),
				highlights: highlightCounts ? (highlightCounts.get(book.id) ?? 0) : null,
			};
			const facets = facetValuesOf(
				{
					...sortKey,
					seriesId: null,
					collectionIds,
					wordCount: book.wordCount,
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
					collectionIds: NO_COLLECTIONS,
					wordCount: 0,
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
	const {
		filter,
		sortBy,
		thenBy = null,
		reversed = false,
		thenReversed = false,
		search = "",
	} = view;
	const needle = search.trim().toLowerCase();
	return items
		.filter((it) => matchesFilter(it.facets, filter) && matchesSearch(it, needle))
		.sort((a, b) => compareByView(a, b, sortBy, thenBy, reversed, thenReversed));
}

export function filterAndSortLibrary(
	books: Book[],
	series: Series[],
	activity: Map<string, SeriesActivity>,
	view: LibraryView,
	now = Date.now(),
	collectionsOf?: ReadonlyMap<string, readonly string[]>,
): LibraryItem[] {
	return applyLibraryView(buildLibraryItems(books, series, activity, now, collectionsOf), view);
}
