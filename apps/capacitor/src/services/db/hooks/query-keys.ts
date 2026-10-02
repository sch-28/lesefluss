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

	/** Body image metadata for a book (no bytes). */
	images: (id: string) => ["books", id, "images"] as const,

	/** One body image's data URL. A sibling of `images`, not a child: refreshing
	 *  the metadata list must not refetch every mounted figure's payload. */
	image: (id: string, key: string) => ["books", id, "image", key] as const,
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

	/** Current and longest streak. */
	streak: ["stats", "streak"] as const,

	/** Top-N books since a cutoff. */
	topBooks: (since: number, limit: number) => ["stats", "top-books", since, limit] as const,

	/** WPM trend, bucketed to the selected period. */
	wpmTrend: (period: string, dayStart: number) => ["stats", "wpm-trend", period, dayStart] as const,

	/** Hour-of-day histogram. */
	hourHistogram: ["stats", "hour-histogram"] as const,

	/** Per-mode reading rates used to estimate time remaining. */
	readingRates: ["stats", "reading-rates"] as const,

	/** Per-book stats card on book detail. */
	book: (bookId: string) => ["stats", "book", bookId] as const,

	/** Cover shelves on the stats page. */
	currentlyReading: ["stats", "currently-reading"] as const,
	finishedBooks: ["stats", "finished-books"] as const,

	/** All-time personal bests. */
	records: ["stats", "records"] as const,

	/** Per-day totals behind the streak calendar. */
	dailyMs: ["stats", "daily-ms"] as const,
};

/**
 * Shared mutation key for every book-import source (file picker, clipboard,
 * URL, plain text, share intent). Used by `useIsMutating` to detect any
 * in-flight import regardless of which component fired it.
 */
export const bookImportMutationKey = ["book-import"] as const;

export const syncKeys = {
	/** Book ids the server holds content for, from the local cache the pull maintains. */
	serverContentIds: ["sync", "server-content-ids"] as const,
};

export const socialKeys = {
	/** Every social query. Cleared on sign-out. */
	all: ["social"] as const,

	/** The signed-in user's own profile and visibility settings. */
	ownProfile: ["social", "own-profile"] as const,

	/** Friends, incoming and outgoing requests, blocked users. */
	relationships: ["social", "relationships"] as const,

	/** The user's current invite link, or null. */
	invite: ["social", "invite"] as const,

	/** Read-only preview of someone else's invite link. */
	invitePreview: (token: string) => ["social", "invite-preview", token] as const,

	/** The inbox pages. */
	inbox: ["social", "inbox"] as const,
	/** Activity feed pages of the viewer and their friends. */
	feed: ["social", "feed"] as const,

	/** Unread inbox items, behind the Social tab badge. */
	unread: ["social", "unread"] as const,

	/** Open shares of one of the user's own books. */
	sharesForBook: (bookId: string) => ["social", "shares-for-book", bookId] as const,

	/** Another user's profile as the viewer may see it; the preview flag is part of the key. */
	profileView: (userId: string, asFriend: boolean) =>
		["social", "profile-view", userId, asFriend] as const,

	/** The user's buddy reads, active and finished. */
	buddyReads: ["social", "buddy-reads"] as const,

	/** One buddy read with its participants. */
	buddyRead: (id: string) => ["social", "buddy-read", id] as const,

	/** Other participants' positions, for the reader's markers. */
	buddyReadProgress: (id: string) => ["social", "buddy-read-progress", id] as const,

	/** A buddy read's discussion as the server gates it for this user. */
	buddyReadDiscussion: (id: string) => ["social", "buddy-read-discussion", id] as const,
};
