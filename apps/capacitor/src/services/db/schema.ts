import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
	xOffset: integer("x_offset").notNull().default(50),
	wordOffset: integer("word_offset").notNull().default(5),
	inverse: integer("inverse", { mode: "boolean" }).notNull().default(false),
	bleOn: integer("ble_on", { mode: "boolean" }).notNull().default(true),
	devMode: integer("dev_mode", { mode: "boolean" }).notNull().default(false),
	displayOffTimeout: integer("display_off_timeout").notNull().default(60),
	deepSleepTimeout: integer("deep_sleep_timeout").notNull().default(120),
	brightness: integer("brightness").notNull().default(100),
	readerTheme: text("reader_theme").notNull().default("dark"),
	readerFontSize: integer("reader_font_size").notNull().default(17),
	readerFontFamily: text("reader_font_family").notNull().default("sans"),
	readerLineSpacing: real("reader_line_spacing").notNull().default(1.8),
	readerMargin: integer("reader_margin").notNull().default(20),
	showReadingTime: integer("show_reading_time", { mode: "boolean" }).notNull().default(true),
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
	fileFormat: text("file_format").notNull().default("txt"), // 'txt' | 'epub'
	filePath: text("file_path"), // path to original file in app data dir, null for legacy/txt
	size: integer("size").notNull().default(0), // byte length of plain text content
	position: integer("position").notNull().default(0),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(false), // true = this book is currently on the ESP32 (at most one row at a time)
	addedAt: integer("added_at").notNull(),
	lastRead: integer("last_read"),
	source: text("source"), // 'gutenberg' | 'standard_ebooks' | null (null = locally imported)
	catalogId: text("catalog_id"), // e.g. 'gutenberg:1342', 'se:mary-shelley/frankenstein'
});

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
