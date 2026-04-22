import { z } from "zod";
import { SETTING_CONSTRAINTS } from "./settings";

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
	source: z.string().max(50).nullable().optional(), // 'gutenberg' | 'standard_ebooks' | null
	catalogId: z.string().max(200).nullable().optional(), // e.g. 'gutenberg:1342'
	updatedAt: z.number().int().nonnegative(), // Unix ms
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
	defaultReaderMode: z.enum(["scroll", "rsvp"]),
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

export const SyncPayloadSchema = z.object({
	books: z.array(SyncBookSchema).max(500),
	settings: SyncSettingsSchema.nullable(),
	highlights: z.array(SyncHighlightSchema).max(5000),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type SyncBook = z.infer<typeof SyncBookSchema>;
export type SyncSettings = z.infer<typeof SyncSettingsSchema>;
export type SyncHighlight = z.infer<typeof SyncHighlightSchema>;
export type SyncPayload = z.infer<typeof SyncPayloadSchema>;

/** Server response shape - same as SyncPayload but settings is always present or null */
export type SyncResponse = {
	books: SyncBook[];
	settings: SyncSettings | null;
	highlights: SyncHighlight[];
};
