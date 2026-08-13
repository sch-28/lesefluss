import type { SyncBook } from "@lesefluss/core";
import { sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { syncBooks } from "~/db/schema";

/** One pushed book as a `sync_books` row. */
export function bookInsertValues(userId: string, book: SyncBook) {
	return {
		userId,
		bookId: book.bookId,
		title: book.title,
		author: book.author,
		fileSize: book.fileSize,
		wordCount: book.wordCount,
		wordPosition: book.wordPosition,
		// Tombstoned books shouldn't carry content; null defensively.
		// Chapter rows (seriesId set) are re-derivable from upstream — never store body
		// content for them server-side, even if an old client still pushes it.
		content: book.deleted || book.seriesId ? null : (book.content ?? null),
		coverImage: book.deleted || book.seriesId ? null : (book.coverImage ?? null),
		chapters: book.deleted || book.seriesId ? null : (book.chapters ?? null),
		source: book.source ?? null,
		catalogId: book.catalogId ?? null,
		sourceUrl: book.sourceUrl ?? null,
		finishedAt: book.finishedAt != null ? new Date(book.finishedAt) : null,
		seriesId: book.seriesId ?? null,
		chapterIndex: book.chapterIndex ?? null,
		chapterSourceUrl: book.chapterSourceUrl ?? null,
		chapterStatus: book.chapterStatus ?? "fetched",
		// A tombstone carries no reader-written text, same rule as content above.
		description: book.deleted ? null : (book.description ?? null),
		language: book.deleted ? null : (book.language ?? null),
		status: book.deleted ? null : (book.status ?? null),
		rating: book.deleted ? null : (book.rating ?? null),
		review: book.deleted ? null : (book.review ?? null),
		tags: book.deleted ? null : (book.tags ?? null),
		deleted: book.deleted,
		updatedAt: new Date(book.updatedAt),
		// A client that pre-dates the column sends nothing; falling back to the row
		// revision keeps the merge below a plain comparison.
		metadataUpdatedAt: new Date(book.metadataUpdatedAt ?? book.updatedAt),
	};
}

/** Conflict target for the books upsert. */
export const bookUpsertTarget = [syncBooks.userId, syncBooks.bookId];

/** Reader-editable columns, absent from any payload built by a client that
 *  pre-dates them. See `claimsMetadata`. */
const METADATA_FIELDS = [
	"description",
	"language",
	"status",
	"rating",
	"review",
	"tags",
] as const satisfies readonly (keyof SyncBook)[];

/**
 * Whether this payload says anything at all about the reader-editable columns.
 *
 * `bookInsertValues` has to collapse `undefined` to `null` to build a row, which
 * destroys the distinction the schema draws between "this client has no such
 * column" and "the reader cleared the value". Callers must therefore ask here
 * BEFORE building the row, and route a book that claims nothing through
 * `bookUpsertSetPreservingMetadata` so the server keeps its own copy.
 */
export function claimsMetadata(book: SyncBook): boolean {
	return METADATA_FIELDS.some((field) => book[field] !== undefined);
}

/**
 * Columns this file merges by revision. A closed union rather than `string`
 * because the SQL below is assembled by interpolation, which a column name
 * cannot avoid (identifiers do not bind as parameters). Nothing caller-supplied
 * may ever reach it.
 */
type MergeableColumn =
	| "title"
	| "author"
	| "word_position"
	| "chapter_status"
	| "description"
	| "language"
	| "status"
	| "rating"
	| "review"
	| "tags";

/**
 * `excluded` wins only if its revision is newer.
 *
 * Which revision depends on the column. `updated_at` is the reading position's,
 * and every released client reads it that way. The reader-editable columns have
 * their own, `metadata_updated_at`, COALESCEd to the row revision for rows last
 * written before that column existed.
 *
 * Metadata uses a STRICT `>`: a client that pre-dates those columns carries the
 * value this row was seeded to, which ties exactly, and `>=` would let that
 * stale push erase an edit made elsewhere.
 */
function lastWriteWins(column: MergeableColumn, operator: ">" | ">=" = ">") {
	const revision = METADATA_FIELDS.some((field) => toColumn(field) === column)
		? "COALESCE(%s.metadata_updated_at, %s.updated_at)"
		: "%s.updated_at";
	const incoming = revision.replaceAll("%s", "excluded");
	const stored = revision.replaceAll("%s", "sync_books");
	return sql.raw(
		`CASE WHEN ${incoming} ${operator} ${stored} THEN excluded.${column} ELSE sync_books.${column} END`,
	);
}

/** camelCase payload field to its snake_case column. */
function toColumn(field: string): string {
	return field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Merge rules for a pushed book that already exists server-side, minus the
 * reader-editable columns. Use for a payload that does not claim them
 * (`claimsMetadata` is false), so the server's values survive a push from a
 * client build that has never heard of them.
 */
export const bookUpsertSetPreservingMetadata: PgUpdateSetSource<typeof syncBooks> = {
	title: lastWriteWins("title"),
	author: lastWriteWins("author"),
	fileSize: sql`excluded.file_size`,
	wordCount: sql`excluded.word_count`,
	// `updated_at` is the position's revision, which is what every released
	// client takes it to mean, so the position gate is unchanged from before the
	// metadata columns existed.
	wordPosition: lastWriteWins("word_position", ">="),
	// Once a row is deleted on the server, content stays null — no client push can refill it.
	// Chapter rows (series_id set) are re-derivable from upstream; never store body content
	// for them, regardless of what an old client pushes or what was there before.
	content: sql`CASE WHEN sync_books.deleted OR excluded.deleted OR excluded.series_id IS NOT NULL THEN NULL ELSE COALESCE(excluded.content, sync_books.content) END`,
	coverImage: sql`CASE WHEN sync_books.deleted OR excluded.deleted OR excluded.series_id IS NOT NULL THEN NULL ELSE COALESCE(excluded.cover_image, sync_books.cover_image) END`,
	chapters: sql`CASE WHEN sync_books.deleted OR excluded.deleted OR excluded.series_id IS NOT NULL THEN NULL ELSE COALESCE(excluded.chapters, sync_books.chapters) END`,
	source: sql`COALESCE(excluded.source, sync_books.source)`,
	catalogId: sql`COALESCE(excluded.catalog_id, sync_books.catalog_id)`,
	sourceUrl: sql`COALESCE(excluded.source_url, sync_books.source_url)`,
	// Sticky: a finish already recorded is never unset by a client that
	// does not know the field, or by one that has not backfilled yet.
	finishedAt: sql`COALESCE(sync_books.finished_at, excluded.finished_at)`,
	seriesId: sql`COALESCE(excluded.series_id, sync_books.series_id)`,
	chapterIndex: sql`COALESCE(excluded.chapter_index, sync_books.chapter_index)`,
	chapterSourceUrl: sql`COALESCE(excluded.chapter_source_url, sync_books.chapter_source_url)`,
	// chapter_status overwrites freely — latest write wins, gated by updated_at.
	chapterStatus: lastWriteWins("chapter_status", ">="),
	// Sticky tombstone: deleted=true cannot be flipped back by any client push.
	deleted: sql`sync_books.deleted OR excluded.deleted`,
	updatedAt: sql`GREATEST(excluded.updated_at, sync_books.updated_at)`,
	metadataUpdatedAt: sql`GREATEST(COALESCE(excluded.metadata_updated_at, excluded.updated_at), COALESCE(sync_books.metadata_updated_at, sync_books.updated_at))`,
	// This payload claims nothing about the reader-editable columns, so a
	// surviving row keeps whatever the server already holds.
	...clearedOnDelete((column) => sql.raw(`sync_books.${column}`)),
};

/**
 * A tombstoned book keeps nothing the reader wrote, mirroring the content /
 * cover / chapters rule: a private review outliving the delete is worse than
 * losing it. Applies on both merge paths, because the push that carries the
 * tombstone claims no metadata and would otherwise take the preserving route.
 *
 * `keep` decides what a surviving row gets: its own stored value on the
 * preserving path, a last-write-wins comparison on the claiming one.
 */
function clearedOnDelete(keep: (column: MergeableColumn) => unknown) {
	return Object.fromEntries(
		METADATA_FIELDS.map((field) => {
			const column = toColumn(field) as MergeableColumn;
			return [
				field,
				sql`CASE WHEN sync_books.deleted OR excluded.deleted THEN NULL ELSE ${keep(column)} END`,
			];
		}),
	);
}

/**
 * Merge rules for a payload that does claim the reader-editable columns
 * (`claimsMetadata` is true), so a cleared value propagates as a clear.
 */
export const bookUpsertSet: PgUpdateSetSource<typeof syncBooks> = {
	...bookUpsertSetPreservingMetadata,
	...clearedOnDelete((column) => lastWriteWins(column)),
};
