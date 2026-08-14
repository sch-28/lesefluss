import { z } from "zod";
import { BOOK_STATUSES } from "./books";
import { HEX_COLOR_REGEX, SETTING_CONSTRAINTS } from "./settings";

/**
 * Max plain-text content size (UTF-8 bytes) a book may have to be eligible for
 * cloud sync. Larger books stay **local-only**: their `content` (and the
 * ~1.5-2x larger wordIndex) would blow the Capacitor bridge marshalling on the
 * client and the request-body limit on the server. Single source of truth for
 * the client exclusion filter, the server Zod cap, and the UI warning.
 */
export const MAX_SYNCED_CONTENT_BYTES = 20_000_000;

/**
 * Caps on the blobs a book carries. Exported because the client has to enforce
 * them before it builds a payload: the server validates a push in one pass and
 * rejects all of it, so a single oversized cover would stop books, highlights,
 * glossary and settings from syncing at all.
 */
export const MAX_SYNCED_COVER_CHARS = 5_000_000;
export const MAX_SYNCED_JSON_CHARS = 500_000;

/**
 * Whether a book participates in cloud sync. Oversized books are local-only.
 * Tombstones always sync so deletions propagate regardless of size.
 */
export function isSyncEligible(book: { size: number; deleted?: boolean | null }): boolean {
	return Boolean(book.deleted) || book.size <= MAX_SYNCED_CONTENT_BYTES;
}

// ---------------------------------------------------------------------------
// Zod schemas - runtime validation on server, type source-of-truth for both apps
// ---------------------------------------------------------------------------

export const SyncBookSchema = z.object({
	bookId: z.string().regex(/^[0-9a-f]{8}$/),
	title: z.string().max(500),
	author: z.string().max(200).nullable(),
	fileSize: z.number().int().nonnegative().nullable(),
	wordCount: z.number().int().nonnegative().nullable(),
	wordPosition: z.number().int().nonnegative(),
	content: z.string().max(MAX_SYNCED_CONTENT_BYTES).nullable().optional(), // full plain text - only sent for new books
	coverImage: z.string().max(MAX_SYNCED_COVER_CHARS).nullable().optional(), // base64 cover - only sent for new books
	chapters: z.string().max(MAX_SYNCED_JSON_CHARS).nullable().optional(), // JSON chapters - only sent for new books
	linkRanges: z.string().max(MAX_SYNCED_JSON_CHARS).nullable().optional(), // JSON external hyperlinks - only sent for new books
	source: z.string().max(50).nullable().optional(), // 'gutenberg' | 'standard_ebooks' | 'url' | null
	catalogId: z.string().max(200).nullable().optional(), // e.g. 'gutenberg:1342'
	sourceUrl: z.string().max(2000).nullable().optional(), // original URL for source='url' imports
	// Optional so clients that pre-date the field still validate; absent means
	// "unknown", not "never finished".
	finishedAt: z.number().int().nonnegative().nullable().optional(),
	// Reader-editable metadata. All optional for the same reason as `finishedAt`:
	// an older client omits them entirely, and absent must not read as "cleared".
	description: z.string().max(20_000).nullable().optional(),
	language: z.string().max(35).nullable().optional(), // BCP 47 tag
	// Explicit shelf. Null means "derive from progress" (see bookStatus()).
	status: z.enum(BOOK_STATUSES).nullable().optional(),
	// Half-stars, so 1..10 where 7 is three and a half. See RATING_MAX.
	rating: z.number().int().min(1).max(10).nullable().optional(),
	review: z.string().max(20_000).nullable().optional(),
	tags: z.string().max(2000).nullable().optional(), // JSON: ["scifi","favorites"]
	/**
	 * Revision of the reader-editable fields, Unix ms. Separate from `updatedAt`,
	 * which every released client reads as the reading position's revision and
	 * must therefore keep meaning exactly that. Optional: a client that pre-dates
	 * the field omits it, and the merge falls back to `updatedAt`.
	 */
	metadataUpdatedAt: z.number().int().nonnegative().nullable().optional(),
	// Serial chapter membership (null for standalone books)
	seriesId: z
		.string()
		.regex(/^[0-9a-f]{8}$/)
		.nullable()
		.optional(),
	chapterIndex: z.number().int().nonnegative().nullable().optional(),
	chapterSourceUrl: z.string().max(2000).nullable().optional(),
	chapterStatus: z.enum(["pending", "fetched", "locked", "error"]).optional().default("fetched"),
	deleted: z.boolean().optional().default(false), // tombstone — sticky once true on server
	updatedAt: z.number().int().nonnegative(), // Unix ms
});

export const SyncSeriesSchema = z.object({
	seriesId: z.string().regex(/^[0-9a-f]{8}$/),
	title: z.string().max(500),
	author: z.string().max(200).nullable(),
	coverImage: z.string().max(5_000_000).nullable().optional(),
	description: z.string().max(20_000).nullable(),
	sourceUrl: z.string().max(2000),
	tocUrl: z.string().max(2000),
	provider: z.enum(["ao3", "scribblehub", "royalroad", "ffnet", "wuxiaworld", "rss"]),
	lastCheckedAt: z.number().int().nonnegative().nullable(),
	createdAt: z.number().int().nonnegative(),
	deleted: z.boolean().optional().default(false),
	updatedAt: z.number().int().nonnegative(),
});

export const SyncSettingsSchema = z.object({
	wpm: z.number().int().min(SETTING_CONSTRAINTS.WPM.min).max(SETTING_CONSTRAINTS.WPM.max),
	delayComma: z
		.number()
		.min(SETTING_CONSTRAINTS.DELAY_COMMA.min)
		.max(SETTING_CONSTRAINTS.DELAY_COMMA.max),
	delayPeriod: z
		.number()
		.min(SETTING_CONSTRAINTS.DELAY_PERIOD.min)
		.max(SETTING_CONSTRAINTS.DELAY_PERIOD.max),
	accelStart: z
		.number()
		.min(SETTING_CONSTRAINTS.ACCEL_START.min)
		.max(SETTING_CONSTRAINTS.ACCEL_START.max),
	accelRate: z
		.number()
		.min(SETTING_CONSTRAINTS.ACCEL_RATE.min)
		.max(SETTING_CONSTRAINTS.ACCEL_RATE.max),
	xOffset: z
		.number()
		.int()
		.min(SETTING_CONSTRAINTS.X_OFFSET.min)
		.max(SETTING_CONSTRAINTS.X_OFFSET.max),
	focalLetterColor: z.custom<`#${string}`>(
		(value) => typeof value === "string" && HEX_COLOR_REGEX.test(value),
	),
	wordOffset: z
		.number()
		.int()
		.min(SETTING_CONSTRAINTS.WORD_OFFSET.min)
		.max(SETTING_CONSTRAINTS.WORD_OFFSET.max),
	readerTheme: z.enum(["dark", "sepia", "light"]),
	readerFontSize: z
		.number()
		.int()
		.min(SETTING_CONSTRAINTS.READER_FONT_SIZE.min)
		.max(SETTING_CONSTRAINTS.READER_FONT_SIZE.max),
	readerFontFamily: z.enum(["sans", "serif"]),
	readerLineSpacing: z
		.number()
		.min(SETTING_CONSTRAINTS.READER_LINE_SPACING.min)
		.max(SETTING_CONSTRAINTS.READER_LINE_SPACING.max),
	readerMargin: z
		.number()
		.int()
		.min(SETTING_CONSTRAINTS.READER_MARGIN.min)
		.max(SETTING_CONSTRAINTS.READER_MARGIN.max),
	showReadingTime: z.boolean(),
	readerActiveWordUnderline: z.boolean().optional().default(true),
	readerGlossaryUnderline: z.boolean().optional().default(true),
	defaultReaderMode: z.enum(["scroll", "rsvp"]),
	paginationStyle: z.enum(["scroll", "page"]),
	updatedAt: z.number().int().nonnegative(),
});

export const SyncHighlightSchema = z
	.object({
		highlightId: z.string().min(1).max(64),
		bookId: z.string().regex(/^[0-9a-f]{8}$/),
		startWord: z.number().int().nonnegative(),
		startCharInWord: z.number().int().nonnegative(),
		endWord: z.number().int().nonnegative(),
		endCharInWord: z.number().int().nonnegative(),
		color: z.enum(["yellow", "blue", "orange", "pink"]),
		note: z.string().max(2000).nullable(),
		text: z.string().max(5000).nullable().optional(),
		deleted: z.boolean(),
		createdAt: z.number().int().nonnegative(),
		updatedAt: z.number().int().nonnegative(),
	})
	.refine((d) => d.endWord >= d.startWord, {
		message: "endWord must be >= startWord",
	});

export const SyncGlossaryEntrySchema = z.object({
	entryId: z.string().min(1).max(64),
	// Nullable: null = global entry (matches in every book), non-null = book-scoped
	bookId: z
		.string()
		.regex(/^[0-9a-f]{8}$/)
		.nullable(),
	label: z.string().min(1).max(200),
	notes: z.string().max(5000).nullable(),
	color: z.string().max(32),
	// Optional for backwards compat with clients that pre-date the field; absent → false.
	hideMarker: z.boolean().optional().default(false),
	deleted: z.boolean(),
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative(),
});

export const SyncReadingSessionSchema = z
	.object({
		sessionId: z.string().min(1).max(64),
		bookId: z.string().regex(/^[0-9a-f]{8}$/),
		mode: z.enum(["rsvp", "scroll", "page"]),
		startedAt: z.number().int().nonnegative(),
		endedAt: z.number().int().nonnegative(),
		durationMs: z.number().int().nonnegative(),
		wordsRead: z.number().int().nonnegative(),
		startWord: z.number().int().nonnegative(),
		endWord: z.number().int().nonnegative(),
		// A slow scroll session legitimately rounds to 0 wpm.
		wpmAvg: z.number().int().nonnegative().nullable(),
		updatedAt: z.number().int().nonnegative(),
	})
	.refine((d) => d.endedAt >= d.startedAt, {
		message: "endedAt must be >= startedAt",
	});

export const SyncPayloadSchema = z.object({
	// Cap is generous because serial chapter rows (seriesId set) carry no body
	// content/cover/TOC, so a 50k-row payload is still small in bytes. The real
	// ceiling on push size is the proxy body limit, not the row count.
	books: z.array(SyncBookSchema).max(50_000),
	settings: SyncSettingsSchema.nullable(),
	highlights: z.array(SyncHighlightSchema).max(5000),
	glossaryEntries: z.array(SyncGlossaryEntrySchema).max(5000).optional().default([]),
	series: z.array(SyncSeriesSchema).max(500).optional().default([]),
	// Reading sessions are append-only; cap matches server-side row cap per user.
	// Clients with more local rows clip newest-first before pushing.
	readingSessions: z.array(SyncReadingSessionSchema).max(50_000).optional().default([]),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type SyncBook = z.infer<typeof SyncBookSchema>;
export type SyncSeries = z.infer<typeof SyncSeriesSchema>;
export type SyncSettings = z.infer<typeof SyncSettingsSchema>;
export type SyncHighlight = z.infer<typeof SyncHighlightSchema>;
export type SyncGlossaryEntry = z.infer<typeof SyncGlossaryEntrySchema>;
export type SyncReadingSession = z.infer<typeof SyncReadingSessionSchema>;
export type SyncPayload = z.infer<typeof SyncPayloadSchema>;

/** Server response shape - same as SyncPayload but settings is always present or null */
export type SyncResponse = {
	books: SyncBook[];
	settings: SyncSettings | null;
	highlights: SyncHighlight[];
	glossaryEntries: SyncGlossaryEntry[];
	series: SyncSeries[];
	readingSessions: SyncReadingSession[];
	/**
	 * Book ids the server currently holds body content for. Lets the client skip
	 * re-uploading content it has already stored, which it cannot otherwise know:
	 * content is omitted from the response for every book listed in `X-Sync-Have`,
	 * so its absence there is ambiguous. Optional so a client pointed at an older
	 * server can fall back instead of treating every book as missing.
	 */
	contentBookIds?: string[];
};
