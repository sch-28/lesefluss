import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * catalog_books — unified index of public-domain books from Gutenberg + Standard Ebooks.
 * ID format: `{source}:{source_id}` — SE source_ids contain slashes (e.g. "mary-shelley/frankenstein").
 *
 * Note: `search_vec` (tsvector generated column) and indexes are created in raw SQL migration —
 * drizzle-kit cannot emit GENERATED ALWAYS AS ... STORED for tsvector. Keep the column list here
 * in sync with the migration.
 */
export const catalogBooks = pgTable(
	"catalog_books",
	{
		id: text("id").primaryKey(),
		source: text("source").notNull(), // "gutenberg" | "standard_ebooks"
		title: text("title").notNull(),
		author: text("author"),
		language: text("language"),
		subjects: text("subjects").array(),
		summary: text("summary"),
		description: text("description"),
		epubUrl: text("epub_url"),
		coverUrl: text("cover_url"),
		gutenbergId: text("gutenberg_id"),
		suppressed: boolean("suppressed").notNull().default(false),
		downloadCount: integer("download_count"),
		syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("catalog_books_suppressed").on(t.suppressed),
		index("catalog_books_language").on(t.language),
	],
);

export type CatalogBook = typeof catalogBooks.$inferSelect;
export type NewCatalogBook = typeof catalogBooks.$inferInsert;

/**
 * catalog_dict_entry — one row per dictionary sense, all languages in one table.
 * Populated from Kaikki.org wiktextract dumps; `lang` is the Wiktionary edition
 * the row came from, so glosses are written in that same language.
 *
 * Keep the column list in sync with drizzle/0002_dictionary.sql by hand.
 *
 * `word_key` is normalizeWord(word). Import and lookup both call that one
 * function in this process, so the write key and the read key cannot drift.
 *
 * Intentionally has no primary key — see the migration for why.
 */
export const catalogDictEntry = pgTable(
	"catalog_dict_entry",
	{
		lang: text("lang").notNull(),
		wordKey: text("word_key").notNull(),
		word: text("word").notNull(),
		/** Orders homographs the dump lists as separate entries. Not unique. */
		entryIndex: integer("entry_index").notNull(),
		pos: text("pos").notNull(),
		/** Import-time sort weight; junk parts of speech rank last. See dict/parse.ts. */
		posRank: integer("pos_rank").notNull(),
		senseIndex: integer("sense_index").notNull(),
		gloss: text("gloss").notNull(),
		example: text("example"),
		/** Lemma pointer for inflected forms, already in word_key form. */
		formOf: text("form_of"),
	},
	(t) => [
		index("catalog_dict_entry_lookup").on(t.wordKey, t.lang),
		index("catalog_dict_entry_lang").on(t.lang),
	],
);

export type DictEntry = typeof catalogDictEntry.$inferSelect;
export type NewDictEntry = typeof catalogDictEntry.$inferInsert;
