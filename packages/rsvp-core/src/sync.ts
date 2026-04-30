import { z } from "zod";
import { HEX_COLOR_REGEX, SETTING_CONSTRAINTS } from "./settings";

// ---------------------------------------------------------------------------
// Zod schemas - runtime validation on server, type source-of-truth for both apps
// ---------------------------------------------------------------------------

export const SyncBookSchema = z.object({
	bookId: z.string().regex(/^[0-9a-f]{8}$/),
	title: z.string().max(500),
	author: z.string().max(200).nullable(),
	fileSize: z.number().int().nonnegative().nullable(),
	wordCount: z.number().int().nonnegative().nullable(),
	position: z.number().int().nonnegative(),
	content: z.string().max(20_000_000).nullable().optional(), // full plain text - only sent for new books
	coverImage: z.string().max(5_000_000).nullable().optional(), // base64 cover - only sent for new books
	chapters: z.string().max(500_000).nullable().optional(), // JSON chapters - only sent for new books
	source: z.string().max(50).nullable().optional(), // 'gutenberg' | 'standard_ebooks' | 'url' | null
	catalogId: z.string().max(200).nullable().optional(), // e.g. 'gutenberg:1342'
	sourceUrl: z.string().max(2000).nullable().optional(), // original URL for source='url' imports
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
		startOffset: z.number().int().nonnegative(),
		endOffset: z.number().int().nonnegative(),
		color: z.enum(["yellow", "blue", "orange", "pink"]),
		note: z.string().max(2000).nullable(),
		text: z.string().max(5000).nullable().optional(), // undefined = absent (old client), null = new client with no stored text
		deleted: z.boolean(),
		createdAt: z.number().int().nonnegative(),
		updatedAt: z.number().int().nonnegative(),
	})
	.refine((d) => d.endOffset >= d.startOffset, {
		message: "endOffset must be >= startOffset",
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

export const SyncPayloadSchema = z.object({
	// Cap is generous because serial chapter rows (seriesId set) carry no body
	// content/cover/TOC, so a 50k-row payload is still small in bytes. The real
	// ceiling on push size is the proxy body limit, not the row count.
	books: z.array(SyncBookSchema).max(50_000),
	settings: SyncSettingsSchema.nullable(),
	highlights: z.array(SyncHighlightSchema).max(5000),
	glossaryEntries: z.array(SyncGlossaryEntrySchema).max(5000).optional().default([]),
	series: z.array(SyncSeriesSchema).max(500).optional().default([]),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type SyncBook = z.infer<typeof SyncBookSchema>;
export type SyncSeries = z.infer<typeof SyncSeriesSchema>;
export type SyncSettings = z.infer<typeof SyncSettingsSchema>;
export type SyncHighlight = z.infer<typeof SyncHighlightSchema>;
export type SyncGlossaryEntry = z.infer<typeof SyncGlossaryEntrySchema>;
export type SyncPayload = z.infer<typeof SyncPayloadSchema>;

/** Server response shape - same as SyncPayload but settings is always present or null */
export type SyncResponse = {
	books: SyncBook[];
	settings: SyncSettings | null;
	highlights: SyncHighlight[];
	glossaryEntries: SyncGlossaryEntry[];
	series: SyncSeries[];
};
