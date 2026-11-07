import { z } from "zod";
import { BOOK_STATUSES } from "./books";
import { isDayKey } from "./day-key";
import { READING_MODES } from "./reading-credit";
import {
	MAX_GOAL_DAILY_MINUTES,
	MAX_GOAL_DAILY_PERCENT,
	MIN_GOAL_DAILY_MINUTES,
	MIN_GOAL_DAILY_PERCENT,
	READING_GOAL_MODES,
	READING_GOAL_STATUSES,
	REMINDER_TIME_REGEX,
} from "./reading-goal";
import {
	HEX_COLOR_REGEX,
	READER_THEMES,
	SETTING_CONSTRAINTS,
	SYNCED_SETTING_KEYS,
} from "./settings";

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

/** Longest book-level series name. The EPUB importer caps at the same length. */
export const BOOK_SERIES_NAME_MAX = 200;
/** Highest book-level series number. */
export const BOOK_SERIES_INDEX_MAX = 100_000;

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
	// When the book entered the reader's library. Travels so a restored library
	// keeps its real add dates instead of inheriting the pushing device's clock.
	// Optional for the same reason as `finishedAt`: absent means the client has
	// no such field, not that the book has no add date.
	addedAt: z.number().int().nonnegative().nullable().optional(),
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
	 * Keep this book off the reader's social profile and out of its stats. Rides
	 * the metadata revision like the fields above, but merges on its own: a
	 * client that pre-dates it omits it, and absent must never read as false.
	 */
	hideFromProfile: z.boolean().optional(),
	/**
	 * Revision of the reader-editable fields, Unix ms. Separate from `updatedAt`,
	 * which every released client reads as the reading position's revision and
	 * must therefore keep meaning exactly that. Optional: a client that pre-dates
	 * the field omits it, and the merge falls back to `updatedAt`.
	 */
	metadataUpdatedAt: z.number().int().nonnegative().nullable().optional(),
	/**
	 * Book-level series ("Foundation" #2.5), unrelated to the serial `seriesId`
	 * below. Merges on its own revision, `seriesUpdatedAt`, so an edit in the
	 * metadata group never undoes it. Optional with no default: a client that
	 * pre-dates the fields omits them, and the server then keeps its own.
	 */
	seriesName: z.string().max(BOOK_SERIES_NAME_MAX).nullable().optional(),
	seriesIndex: z.number().nonnegative().max(BOOK_SERIES_INDEX_MAX).nullable().optional(),
	seriesUpdatedAt: z.number().int().nonnegative().nullable().optional(),
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
	readerTheme: z.enum(READER_THEMES),
	readerFontSize: z
		.number()
		.int()
		.min(SETTING_CONSTRAINTS.READER_FONT_SIZE.min)
		.max(SETTING_CONSTRAINTS.READER_FONT_SIZE.max),
	readerFontFamily: z.enum(["sans", "serif", "atkinson", "opendyslexic", "literata"]),
	readerBold: z.boolean(),
	readerTextAlign: z.enum(["left", "justify"]),
	readerRuler: z.boolean(),
	readerRulerLines: z
		.number()
		.int()
		.min(SETTING_CONSTRAINTS.READER_RULER_LINES.min)
		.max(SETTING_CONSTRAINTS.READER_RULER_LINES.max),
	readerLineSpacing: z
		.number()
		.min(SETTING_CONSTRAINTS.READER_LINE_SPACING.min)
		.max(SETTING_CONSTRAINTS.READER_LINE_SPACING.max),
	readerMargin: z
		.number()
		.int()
		.min(SETTING_CONSTRAINTS.READER_MARGIN.min)
		.max(SETTING_CONSTRAINTS.READER_MARGIN.max),
	readerLetterSpacing: z
		.number()
		.min(SETTING_CONSTRAINTS.READER_LETTER_SPACING.min)
		.max(SETTING_CONSTRAINTS.READER_LETTER_SPACING.max),
	readerWordSpacing: z
		.number()
		.min(SETTING_CONSTRAINTS.READER_WORD_SPACING.min)
		.max(SETTING_CONSTRAINTS.READER_WORD_SPACING.max),
	readerParagraphSpacing: z
		.number()
		.min(SETTING_CONSTRAINTS.READER_PARAGRAPH_SPACING.min)
		.max(SETTING_CONSTRAINTS.READER_PARAGRAPH_SPACING.max),
	showReadingTime: z.boolean(),
	showLiveWpm: z.boolean(),
	readerActiveWordUnderline: z.boolean().optional().default(true),
	readerGlossaryUnderline: z.boolean().optional().default(true),
	defaultReaderMode: z.enum(["scroll", "rsvp"]),
	paginationStyle: z.enum(["scroll", "page"]),
	updatedAt: z.number().int().nonnegative(),
});

type SyncedSettingKey = (typeof SYNCED_SETTING_KEYS)[number];

/** A pushed settings row as the server stores it: only the fields it could validate. */
export type SyncSettingsPush = Partial<Pick<SyncSettings, SyncedSettingKey>> &
	Pick<SyncSettings, "updatedAt">;

/**
 * How the server reads pushed settings. A client newer than the server may send
 * a value this schema does not know yet, and a client older than a field omits
 * it. Both drop just that field, so the stored value survives and the rest of
 * the push still applies. `SyncSettingsSchema`'s defaults must not run here:
 * they would overwrite a value set by a newer device.
 */
const SyncSettingsPushSchema = z
	.looseObject({ updatedAt: SyncSettingsSchema.shape.updatedAt })
	.transform((raw): SyncSettingsPush => {
		const fields: Partial<Record<SyncedSettingKey, unknown>> & { updatedAt: number } = {
			updatedAt: raw.updatedAt,
		};
		for (const key of SYNCED_SETTING_KEYS) {
			if (raw[key] === undefined) continue;
			const parsed = SyncSettingsSchema.shape[key].safeParse(raw[key]);
			if (parsed.success) fields[key] = parsed.data;
		}
		return fields as SyncSettingsPush;
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

/** A Postgres `integer` column: larger values would fail the insert instead of the parse. */
const pgInt = () => z.number().int().nonnegative().max(2_147_483_647);

export const SyncReadingSessionSchema = z
	.object({
		sessionId: z.string().min(1).max(64),
		bookId: z.string().regex(/^[0-9a-f]{8}$/),
		mode: z.enum(READING_MODES),
		startedAt: z.number().int().nonnegative(),
		endedAt: z.number().int().nonnegative(),
		durationMs: z.number().int().nonnegative(),
		wordsRead: z.number().int().nonnegative(),
		startWord: pgInt(),
		endWord: pgInt(),
		// Highest word read in the sitting. Optional: clients from before it existed omit it.
		furthestWord: pgInt().nullable().optional(),
		// A slow scroll session legitimately rounds to 0 wpm.
		wpmAvg: z.number().int().nonnegative().nullable(),
		updatedAt: z.number().int().nonnegative(),
	})
	.refine((d) => d.endedAt >= d.startedAt, {
		message: "endedAt must be >= startedAt",
	});

// Bounded to what Postgres `integer` and a JS Date hold: an out-of-range value
// passes validation but fails the insert, which aborts the whole push.
const epochMs = () => z.number().int().nonnegative().max(8.64e15);
const dayKey = () => z.string().refine(isDayKey, { message: "not a calendar date" });

export const SyncReadingGoalSchema = z.object({
	goalId: z.string().min(1).max(64),
	bookId: z.string().regex(/^[0-9a-f]{8}$/),
	mode: z.enum(READING_GOAL_MODES),
	status: z.enum(READING_GOAL_STATUSES),
	startedAt: epochMs(),
	startWord: pgInt(),
	planStartDate: dayKey(),
	planStartWord: pgInt(),
	targetDate: dayKey(),
	dailyPercent: z.number().min(MIN_GOAL_DAILY_PERCENT).max(MAX_GOAL_DAILY_PERCENT),
	/** A minute goal's minutes a day; null for a percent or date goal. Optional
	 *  on the wire: a client from before minute goals omits it. */
	dailyMinutes: z
		.number()
		.min(MIN_GOAL_DAILY_MINUTES)
		.max(MAX_GOAL_DAILY_MINUTES)
		.nullable()
		.optional(),
	carriedDaysMet: pgInt(),
	completedAt: epochMs().nullable(),
	reminderTime: z.string().regex(REMINDER_TIME_REGEX).nullable(),
	deleted: z.boolean(),
	createdAt: epochMs(),
	updatedAt: epochMs(),
});

export const COLLECTION_NAME_MAX = 100;
export const COLLECTIONS_PUSH_MAX = 1000;
export const COLLECTION_BOOKS_PUSH_MAX = 50_000;

export const SyncCollectionSchema = z.object({
	collectionId: z.string().min(1).max(64),
	name: z.string().trim().min(1).max(COLLECTION_NAME_MAX),
	sortOrder: z.number(),
	/** Optional on the wire: a client from before series collections omits them, and the server keeps what it stores. */
	ordered: z.boolean().optional(),
	seriesKey: z.string().min(1).max(BOOK_SERIES_NAME_MAX).nullable().optional(),
	deleted: z.boolean(),
	createdAt: epochMs(),
	updatedAt: epochMs(),
});

/** One membership. `deleted` is a row value so a book removed and added again wins by `updatedAt`. */
export const SyncCollectionBookSchema = z.object({
	collectionId: z.string().min(1).max(64),
	bookId: z.string().regex(/^[0-9a-f]{8}$/),
	seriesIndex: z.number().nonnegative().max(BOOK_SERIES_INDEX_MAX).nullable().optional(),
	position: z.number().finite().nullable().optional(),
	deleted: z.boolean(),
	updatedAt: epochMs(),
});

export const SMART_SHELF_NAME_MAX = 100;
export const SMART_SHELVES_PUSH_MAX = 500;
export const SMART_SHELF_CONDITIONS_MAX = 16_384;

/** `conditions` is the condition tree as JSON, carried opaquely so a tree a newer
 *  client writes survives a round trip through an older one. */
export const SyncSmartShelfSchema = z.object({
	shelfId: z.string().min(1).max(64),
	name: z.string().trim().min(1).max(SMART_SHELF_NAME_MAX),
	conditions: z.string().min(2).max(SMART_SHELF_CONDITIONS_MAX),
	pinned: z.boolean(),
	sortOrder: z.number(),
	deleted: z.boolean(),
	createdAt: epochMs(),
	updatedAt: epochMs(),
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
	// Pushed incrementally against a watermark; deletions travel through their own
	// endpoints, never as omissions. Clients with more local rows clip before pushing.
	readingSessions: z.array(SyncReadingSessionSchema).max(50_000).optional().default([]),
	// No default: a client that pre-dates goals omits the field, and that must
	// not read as "this account has no goals".
	readingGoals: z.array(SyncReadingGoalSchema).max(5000).optional(),
	// No default, as with goals: an omitted array never means "no collections".
	collections: z.array(SyncCollectionSchema).max(COLLECTIONS_PUSH_MAX).optional(),
	collectionBooks: z.array(SyncCollectionBookSchema).max(COLLECTION_BOOKS_PUSH_MAX).optional(),
	smartShelves: z.array(SyncSmartShelfSchema).max(SMART_SHELVES_PUSH_MAX).optional(),
});

/** The server's reading of a push. Clients build pushes against `SyncPayloadSchema`. */
export const SyncPushSchema = SyncPayloadSchema.extend({
	settings: SyncSettingsPushSchema.nullable(),
});

/**
 * The stamps a push carried from a clock running ahead of the server's, after
 * the server clamped them to its own time. The pushing device adopts them, or
 * its future stamps would hide every newer row another device writes until real
 * time catches up. Lists only the clamped rows; a push with none gets no body.
 */
export const SyncPushStampsSchema = z.object({
	books: z
		.array(
			z.object({
				bookId: z.string(),
				updatedAt: epochMs(),
				metadataUpdatedAt: epochMs(),
				// Absent from a server that pre-dates the series revision.
				seriesUpdatedAt: epochMs().optional(),
			}),
		)
		.max(50_000),
	settingsUpdatedAt: epochMs().nullable(),
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
/** Ids per `/api/sync/delete-sessions` call; a client chunks a larger delete. */
export const DELETE_SESSIONS_BATCH_MAX = 500;

/** The push schema's id cap: an unknown id leaves a permanent placeholder tombstone. */
export const DeleteSessionsRequestSchema = z.object({
	sessionIds: z.array(z.string().min(1).max(64)).min(1).max(DELETE_SESSIONS_BATCH_MAX),
});

/** A malformed tombstone list deletes nothing rather than failing the pull. */
export const DeletedSessionIdsSchema = z.array(z.string()).catch([]);
export type SyncReadingGoal = z.infer<typeof SyncReadingGoalSchema>;
export type SyncCollection = z.infer<typeof SyncCollectionSchema>;
export type SyncCollectionBook = z.infer<typeof SyncCollectionBookSchema>;
export type SyncSmartShelf = z.infer<typeof SyncSmartShelfSchema>;
export type SyncPayload = z.infer<typeof SyncPayloadSchema>;
export type SyncPush = z.infer<typeof SyncPushSchema>;
export type SyncPushStamps = z.infer<typeof SyncPushStampsSchema>;

/**
 * A pulled book. `originKey` is an opaque, server-computed identity of the
 * content's origin (same key = same source book, whoever holds a copy); a
 * client stores it and never sends it back.
 */
export type SyncResponseBook = SyncBook & { originKey?: string };

/** Server response shape - same as SyncPayload but settings is always present or null */
export type SyncResponse = {
	books: SyncResponseBook[];
	settings: SyncSettings | null;
	highlights: SyncHighlight[];
	glossaryEntries: SyncGlossaryEntry[];
	series: SyncSeries[];
	/** Live sessions only; deleted ones are listed in `deletedSessionIds`. */
	readingSessions: SyncReadingSession[];
	/**
	 * Sessions deleted on any device since the pull's `sessionTombstonesSince`
	 * param, which every device drops locally. Ids rather than tombstoned rows so a
	 * client that pre-dates them cannot read one as live. Absent when the param is
	 * (older clients) or the server pre-dates tombstones.
	 */
	deletedSessionIds?: string[];
	/** Server time the tombstone list is complete up to: the next pull's param. */
	deletedSessionIdsAsOf?: number;
	/** Optional so a client pointed at an older server can do without it. */
	readingGoals?: SyncReadingGoal[];
	/** Optional so a client pointed at an older server can do without it. Tombstones included. */
	collections?: SyncCollection[];
	collectionBooks?: SyncCollectionBook[];
	/** Optional so a client pointed at an older server can do without it. Tombstones included. */
	smartShelves?: SyncSmartShelf[];
	/**
	 * Book ids the server currently holds body content for. Lets the client skip
	 * re-uploading content it has already stored, which it cannot otherwise know:
	 * content is omitted from the response for every book listed in `X-Sync-Have`,
	 * so its absence there is ambiguous. Optional so a client pointed at an older
	 * server can fall back instead of treating every book as missing.
	 */
	contentBookIds?: string[];
	/** Optional so a client pointed at an older server can do without it. */
	contentQuota?: ContentQuota;
	/**
	 * The server's clock (ms) as it answered, from which a client keeps its clock
	 * offset. Optional: older servers do not send it.
	 */
	serverTime?: number;
};

/**
 * Server-side storage an account's live synced books take up, against its cap.
 * Measured by the server from what it stores; the client-supplied `fileSize`
 * plays no part.
 */
export type ContentQuota = { usedBytes: number; quotaBytes: number };

export const CONTENT_QUOTA_EXCEEDED = "content_quota_exceeded";

/**
 * Body of the 413 a push gets when some of its book content would not fit the
 * quota. Everything else in that push (positions, settings, highlights, the
 * books themselves) IS committed; only the content of `rejectedContentBookIds`
 * was left out, so those books stay on the device that holds their text.
 */
export type ContentQuotaExceeded = ContentQuota & {
	error: string;
	code: typeof CONTENT_QUOTA_EXCEEDED;
	rejectedContentBookIds: string[];
	/**
	 * Bytes each refused book would have added, so a client offers it again only
	 * once that much is free. Optional: older servers send only the ids.
	 */
	rejectedContentBytes?: Record<string, number>;
	/** As a 2xx push answer carries them: absent when nothing was clamped, or from a server that pre-dates stamps. */
	stamps?: SyncPushStamps;
};
