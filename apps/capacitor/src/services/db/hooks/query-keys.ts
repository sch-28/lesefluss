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

export const bookKeys = {
	/** All books list - invalidate this to refresh the library grid. */
	all: ["books"] as const,

	/** Single book metadata. */
	detail: (id: string) => ["books", id] as const,

	/** Single book content (large text + cover + chapters). */
	content: (id: string) => ["books", id, "content"] as const,

	/** Cover images map (bookId → base64 data URL). */
	covers: ["book-covers"] as const,

	/** All highlights for a book, ordered by position. */
	highlights: (id: string) => ["books", id, "highlights"] as const,

	/** Glossary entries visible inside a book (book-scoped + global). */
	glossary: (id: string) => ["books", id, "glossary"] as const,
};

export const glossaryKeys = {
	/** Every key under this prefix — invalidate when any entry changes. */
	all: ["glossary"] as const,
};

export const settingsKeys = {
	/** The single settings row. */
	all: ["settings"] as const,
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

/**
 * Shared mutation key for every book-import source (file picker, clipboard,
 * URL, plain text, share intent). Used by `useIsMutating` to detect any
 * in-flight import regardless of which component fired it.
 */
export const bookImportMutationKey = ["book-import"] as const;
