import type { PaginationStyle } from "@lesefluss/rsvp-core";
import { sql } from "drizzle-orm";
import { check, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// NOTE: id is a random 8-char hex string generated at import time.
// It doubles as the book identity on the ESP32 (stored in book.hash after transfer).

/**
 * Device connection history - tracks ESP32 devices we've connected to
 */
export const devices = sqliteTable("devices", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	lastConnected: integer("last_connected").notNull(),
});

/**
 * RSVP settings - single row (id = 1), mirrors ESP32 config.py
 */
export const settings = sqliteTable("settings", {
	id: integer("id").primaryKey(),
	wpm: integer("wpm").notNull().default(350),
	delayComma: real("delay_comma").notNull().default(2.0),
	delayPeriod: real("delay_period").notNull().default(3.0),
	accelStart: real("accel_start").notNull().default(2.0),
	accelRate: real("accel_rate").notNull().default(0.1),
	xOffset: integer("x_offset").notNull().default(30),
	wordOffset: integer("word_offset").notNull().default(5),
	inverse: integer("inverse", { mode: "boolean" }).notNull().default(false),
	bleOn: integer("ble_on", { mode: "boolean" }).notNull().default(true),
	devMode: integer("dev_mode", { mode: "boolean" }).notNull().default(false),
	displayOffTimeout: integer("display_off_timeout").notNull().default(60),
	deepSleepTimeout: integer("deep_sleep_timeout").notNull().default(120),
	brightness: integer("brightness").notNull().default(100),
	readerTheme: text("reader_theme").notNull().default("dark"),
	readerFontSize: integer("reader_font_size").notNull().default(16),
	readerFontFamily: text("reader_font_family").notNull().default("sans"),
	readerLineSpacing: real("reader_line_spacing").notNull().default(1.8),
	readerMargin: integer("reader_margin").notNull().default(20),
	readerActiveWordUnderline: integer("reader_active_word_underline", { mode: "boolean" })
		.notNull()
		.default(true),
	readerGlossaryUnderline: integer("reader_glossary_underline", { mode: "boolean" })
		.notNull()
		.default(true),
	showReadingTime: integer("show_reading_time", { mode: "boolean" }).notNull().default(true),
	defaultReaderMode: text("default_reader_mode")
		.$type<"scroll" | "rsvp">()
		.notNull()
		.default("scroll"),
	paginationStyle: text("pagination_style").$type<PaginationStyle>().notNull().default("scroll"),
	onboardingCompleted: integer("onboarding_completed", { mode: "boolean" })
		.notNull()
		.default(false),
	appFontSize: integer("app_font_size").notNull().default(16),
	lastSeenChangelogDate: text("last_seen_changelog_date").notNull().default(""),
	updatedAt: integer("updated_at").notNull(),
});

/**
 * Books library - metadata only.
 * Large data (content, cover, chapters) lives in `bookContent`.
 */
export const books = sqliteTable("books", {
	id: text("id").primaryKey(), // random 8-char hex, also used as book.hash on ESP32
	title: text("title").notNull(),
	author: text("author"),
	fileFormat: text("file_format").notNull().default("txt"), // 'txt' | 'epub' | 'html' | 'pdf'
	filePath: text("file_path"), // path to original file in app data dir, null for legacy/txt
	size: integer("size").notNull().default(0), // byte length of plain text content
	position: integer("position").notNull().default(0),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(false), // true = this book is currently on the ESP32 (at most one row at a time)
	addedAt: integer("added_at").notNull(),
	lastRead: integer("last_read"),
	source: text("source"), // 'gutenberg' | 'standard_ebooks' | 'url' | 'serial' | null (null = locally imported)
	catalogId: text("catalog_id"), // e.g. 'gutenberg:1342', 'se:mary-shelley/frankenstein'
	sourceUrl: text("source_url"), // original URL for source='url' imports
	deleted: integer("deleted", { mode: "boolean" }).notNull().default(false), // tombstone — pushed to server then hard-deleted on next pull
	// Serial/web-novel chapter membership. NULL series_id = standalone book.
	seriesId: text("series_id"),
	chapterIndex: integer("chapter_index"), // 0-based ordering within series
	chapterSourceUrl: text("chapter_source_url"), // stable identity key for chapter-level upstream
	chapterStatus: text("chapter_status")
		.$type<"pending" | "fetched" | "locked" | "error">()
		.notNull()
		.default("fetched"),
});

/**
 * Series — one row per imported web-novel/serial. Chapters are `books` rows
 * with `series_id` set; chapter count is `COUNT(*)` (no denormalized cache).
 */
export const series = sqliteTable(
	"series",
	{
		id: text("id").primaryKey(), // 8-char hex
		title: text("title").notNull(),
		author: text("author"),
		coverImage: text("cover_image"), // base64 data URL
		description: text("description"),
		sourceUrl: text("source_url").notNull(), // canonical series page
		tocUrl: text("toc_url").notNull(), // URL polled for chapter list updates
		provider: text("provider")
			.$type<"ao3" | "scribblehub" | "royalroad" | "ffnet" | "wuxiaworld" | "rss">()
			.notNull(),
		lastCheckedAt: integer("last_checked_at"),
		createdAt: integer("created_at").notNull(),
		deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
		updatedAt: integer("updated_at").notNull(),
	},
	(t) => [
		check(
			"series_provider_check",
			sql`${t.provider} IN ('ao3', 'scribblehub', 'royalroad', 'ffnet', 'wuxiaworld', 'rss')`,
		),
	],
);

/**
 * Book content - large data stored separately from metadata.
 * Keeps list queries lightweight (no multi-MB content in result sets).
 *
 * - content: full plain text (for ESP32 transfer + RSVP reader)
 * - coverImage: base64-encoded cover art extracted from EPUB
 * - chapters: JSON array of [{title: string, startByte: number}]
 */
export const bookContent = sqliteTable("book_content", {
	bookId: text("book_id").primaryKey(),
	content: text("content").notNull(),
	coverImage: text("cover_image"),
	chapters: text("chapters"), // JSON: [{title: string, startByte: number}]
});

/**
 * Highlights - per-book text annotations with optional notes.
 * start_offset and end_offset are UTF-8 byte offsets of word starts (inclusive).
 */
export const highlights = sqliteTable("highlights", {
	id: text("id").primaryKey(),
	bookId: text("book_id").notNull(),
	startOffset: integer("start_offset").notNull(),
	endOffset: integer("end_offset").notNull(),
	color: text("color").notNull().default("yellow"), // 'yellow' | 'blue' | 'orange' | 'pink'
	note: text("note"),
	text: text("text"), // extracted text snippet - null for pre-existing highlights
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

// Inferred types for use across the app
export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;

export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;

export type BookContent = typeof bookContent.$inferSelect;
export type NewBookContent = typeof bookContent.$inferInsert;

/** Chapter entry as stored in bookContent.chapters JSON column */
export type Chapter = { title: string; startByte: number };

export type Highlight = typeof highlights.$inferSelect;
export type NewHighlight = typeof highlights.$inferInsert;

/**
 * Glossary entries — per-book or global recurring-name notes.
 * `bookId` nullable: NULL = global (matches in every book), non-null = book-scoped.
 */
export const glossaryEntries = sqliteTable("glossary_entries", {
	id: text("id").primaryKey(),
	bookId: text("book_id"), // null = global
	label: text("label").notNull(),
	notes: text("notes"),
	color: text("color").notNull(),
	// Per-entry override: when true, the entry still tracks tap targets but no
	// marker (avatar) is rendered. The global `readerGlossaryUnderline` setting
	// still gates the whole feature; this only narrows the visual within "on" mode.
	hideMarker: integer("hide_marker", { mode: "boolean" }).notNull().default(false),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export type GlossaryEntry = typeof glossaryEntries.$inferSelect;
export type NewGlossaryEntry = typeof glossaryEntries.$inferInsert;

export type Series = typeof series.$inferSelect;
export type NewSeries = typeof series.$inferInsert;
