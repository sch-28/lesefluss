/**
 * Centralised react-query key factory.
 *
 * Rules:
 *   - All keys are `as const` tuples so TypeScript can narrow them.
 *   - Broader keys are prefixes of narrower ones so that
 *     invalidateQueries({ queryKey: bookKeys.all }) automatically
 *     invalidates all book detail + content queries too.
 *
 * Key hierarchy:
 *   ['books']                      ← all books list
 *   ['book-covers']                ← covers map (separate because it's a different query)
 *   ['books', id]                  ← single book metadata
 *   ['books', id, 'content']       ← single book content (large, keyed separately)
 *   ['settings']                   ← single settings row
 */

import { startOfLocalDay } from "../../../utils/date-utils";

export const bookKeys = {
	/** All books list - invalidate this to refresh the library grid. */
	all: ["books"] as const,

	/** Single book metadata. */
	detail: (id: string) => ["books", id] as const,

	/** Single book content (large text + cover + chapters). */
	content: (id: string) => ["books", id, "content"] as const,

	/** Cover images map (bookId → base64 data URL). */
	covers: ["book-covers"] as const,

	/** Every non-tombstoned book row including series chapters. */
	allIncludingChapters: ["books", "all-including-chapters"] as const,

	/** All highlights for a book, ordered by position. */
	highlights: (id: string) => ["books", id, "highlights"] as const,

	/** Glossary entries visible inside a book (book-scoped + global). */
	glossary: (id: string) => ["books", id, "glossary"] as const,

	/** Deserialized WordIndex for a book (ADR-0002). Keyed separately from content. */
	wordIndex: (id: string) => ["books", id, "word-index"] as const,
};

export const glossaryKeys = {
	/** Every key under this prefix — invalidate when any entry changes. */
	all: ["glossary"] as const,
};

export const settingsKeys = {
	/** The single settings row. */
	all: ["settings"] as const,
};

export const readingSessionKeys = {
	/** All reading sessions across all books. */
	all: ["reading-sessions"] as const,

	/** Newest-first page, optionally scoped to one book. */
	page: (limit: number, bookId?: string) =>
		["reading-sessions", "page", bookId ?? "all", limit] as const,

	/** Row count, optionally scoped to one book. */
	count: (bookId?: string) => ["reading-sessions", "count", bookId ?? "all"] as const,
};

export const serialKeys = {
	/** Every key under this prefix — invalidate when any series changes. */
	all: ["serials"] as const,

	/** Library list of series (excludes tombstones). */
	list: ["serials", "list"] as const,

	/** Map<seriesId, chapterCount> — driven by a single COUNT(*) query. */
	counts: ["serials", "counts"] as const,

	/** Map<seriesId, SeriesActivity>. Totals + read-state per series for library filter/sort. */
	activity: ["serials", "activity"] as const,

	/** Single series row by id (used by SeriesDetail). */
	detail: (seriesId: string) => ["serials", "detail", seriesId] as const,

	/** Resume target — the chapter to open when the series card is tapped. */
	entry: (seriesId: string) => ["serials", "entry", seriesId] as const,

	/** Free-text search across providers. `provider` narrows the fan-out. */
	search: (query: string, provider?: string) =>
		["serials", "search", query, provider ?? null] as const,

	/** Popular/trending shelf — empty-state surface on the web-novels page. */
	popular: (provider?: string) => ["serials", "popular", provider ?? null] as const,

	/** Ordered chapter rows (books) for a series. Subset of serialKeys.all. */
	chapters: (seriesId: string) => ["serials", "chapters", seriesId] as const,
};

export const statsKeys = {
	/** Every key under this prefix. Invalidate when sessions change. */
	all: ["stats"] as const,

	/**
	 * Period totals scoped by [start, end]. The end is quantised to the local day
	 * because callers pass `Date.now()`, which would mint a fresh key on every
	 * visit and never hit the cache. Writes invalidate `statsKeys.all`, so a
	 * day-stable key cannot go stale behind a new session.
	 */
	periodTotals: (start: number, end: number) =>
		["stats", "period", start, startOfLocalDay(end)] as const,

	/**
	 * Totals for a closed historical window. Unlike the live one this cannot
	 * quantise its end: the comparison window is clipped to the same elapsed
	 * offset as the current one, so two times of day on the same date describe
	 * genuinely different windows.
	 */
	closedPeriodTotals: (start: number, end: number) =>
		["stats", "period", "closed", start, end] as const,

	/** Streak headline + 90-day series. */
	streak: ["stats", "streak"] as const,

	/** Top-N books since a cutoff. */
	topBooks: (since: number, limit: number) => ["stats", "top-books", since, limit] as const,

	/** WPM trend, bucketed to the selected period. */
	wpmTrend: (period: string, dayStart: number) => ["stats", "wpm-trend", period, dayStart] as const,

	/** Hour-of-day histogram. */
	hourHistogram: (since: number) => ["stats", "hour-histogram", since] as const,

	/** Single-stat callouts. */
	personality: (since: number) => ["stats", "personality", since] as const,

	/** Per-book stats card on book detail. */
	book: (bookId: string) => ["stats", "book", bookId] as const,
};

/**
 * Shared mutation key for every book-import source (file picker, clipboard,
 * URL, plain text, share intent). Used by `useIsMutating` to detect any
 * in-flight import regardless of which component fired it.
 */
export const bookImportMutationKey = ["book-import"] as const;
