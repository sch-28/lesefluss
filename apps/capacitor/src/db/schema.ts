import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Device connection history — tracks ESP32 devices we've connected to
 */
export const devices = sqliteTable("devices", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	lastConnected: integer("last_connected").notNull(),
});

/**
 * RSVP settings — single row (id = 1), mirrors ESP32 config.py
 * currentSlot removed: it belongs to book sync context (Phase 5)
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
	updatedAt: integer("updated_at").notNull(),
});

/**
 * Books library — metadata only.
 * Large data (content, cover, chapters) lives in `bookContent`.
 */
export const books = sqliteTable("books", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	title: text("title").notNull(),
	author: text("author"),
	fileFormat: text("file_format").notNull().default("txt"), // 'txt' | 'epub'
	filePath: text("file_path"), // path to original file in app data dir, null for legacy/txt
	size: integer("size").notNull().default(0), // byte length of plain text content
	position: integer("position").notNull().default(0),
	slot: integer("slot"), // ESP32 slot (1-4) if synced, null otherwise
	addedAt: integer("added_at").notNull(),
	lastRead: integer("last_read"),
});

/**
 * Book content — large data stored separately from metadata.
 * Keeps list queries lightweight (no multi-MB content in result sets).
 *
 * - content: full plain text (for ESP32 transfer + RSVP reader)
 * - coverImage: base64-encoded cover art extracted from EPUB
 * - chapters: JSON array of [{title: string, startByte: number}]
 */
export const bookContent = sqliteTable("book_content", {
	bookId: integer("book_id").primaryKey(),
	content: text("content").notNull(),
	coverImage: text("cover_image"),
	chapters: text("chapters"), // JSON: [{title: string, startByte: number}]
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
