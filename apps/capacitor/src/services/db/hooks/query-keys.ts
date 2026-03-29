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
	/** All books list — invalidate this to refresh the library grid. */
	all: ["books"] as const,

	/** Single book metadata. */
	detail: (id: string) => ["books", id] as const,

	/** Single book content (large text + cover + chapters). */
	content: (id: string) => ["books", id, "content"] as const,

	/** Cover images map (bookId → base64 data URL). */
	covers: ["book-covers"] as const,
};

export const settingsKeys = {
	/** The single settings row. */
	all: ["settings"] as const,
};
