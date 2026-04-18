import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
		syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("catalog_books_suppressed").on(t.suppressed),
		index("catalog_books_language").on(t.language),
	],
);

export type CatalogBook = typeof catalogBooks.$inferSelect;
export type NewCatalogBook = typeof catalogBooks.$inferInsert;
