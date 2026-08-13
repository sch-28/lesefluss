import type { Chapter as ImportChapter, ImportLink } from "@lesefluss/book-import";
import {
	byteRangeToWordRange,
	FINISHED_PERCENT_THRESHOLD,
	MAX_SYNCED_CONTENT_BYTES,
	type SerializedWordIndex,
	WordIndex,
} from "@lesefluss/core";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { db } from "../index";
import { appendLongText, LONG_TEXT_CHUNK, type LongTextExecutor, readLongText } from "../long-text";
import {
	type Book,
	type BookContent,
	bookContent,
	books,
	type Chapter,
	glossaryEntries,
	highlights,
	type LinkRange,
	type NewBook,
} from "../schema";

/** Reader-editable columns, the ones `metadata_updated_at` is the revision of. */
const METADATA_COLUMNS = [
	"description",
	"language",
	"status",
	"rating",
	"review",
	"tags",
] as const satisfies readonly (keyof NewBook)[];

/** The production drizzle proxy as a chunked-column executor (see long-text.ts). */
const longText: LongTextExecutor = {
	run: (q) => db.run(q),
	get: (q) => db.get(q) as Promise<unknown[] | undefined>,
};

/**
 * Fetch standalone books for the library grid (metadata only) ordered by most
 * recently read. Chapter rows (`series_id IS NOT NULL`) are excluded — they
 * surface in the UI via their parent series card, not as standalone books.
 *
 * For sync (which needs to see chapter rows too), use `getBooksForSync()`.
 */
export async function getBooks(): Promise<Book[]> {
	return db
		.select()
		.from(books)
		.where(and(eq(books.deleted, false), isNull(books.seriesId)))
		.orderBy(desc(books.lastRead), desc(books.addedAt));
}

/**
 * Fetch all non-deleted books including series chapters.
 */
export async function getAllBooks(): Promise<Book[]> {
	return db.select().from(books).where(eq(books.deleted, false));
}

/**
 * Fetch all books including tombstones — used by the sync push so deletions propagate.
 */
export async function getBooksForSync(): Promise<Book[]> {
	return db.select().from(books);
}

/**
 * Fetch cover images for all books. Returns a map of bookId → coverImage (base64 data URL).
 * Only fetches the cover_image column - avoids loading the full content text.
 */
export async function getBookCovers(): Promise<Map<string, string>> {
	const rows = await db
		.select({
			bookId: bookContent.bookId,
			coverImage: bookContent.coverImage,
		})
		.from(bookContent);

	const map = new Map<string, string>();
	for (const row of rows) {
		if (row.coverImage) {
			map.set(row.bookId, row.coverImage);
		}
	}
	return map;
}

/**
 * Fetch a single book's metadata by id.
 */
export async function getBook(id: string): Promise<Book | undefined> {
	const rows = await db.select().from(books).where(eq(books.id, id));
	return rows[0];
}

/**
 * Fetch a book previously imported from the catalog by its catalog id
 * (e.g. "gutenberg:1342", "se:mary-shelley/frankenstein").
 * Used for idempotent re-imports and for linking Explore → Library.
 */
export async function getBookByCatalogId(catalogId: string): Promise<Book | null> {
	const rows = await db
		.select()
		.from(books)
		.where(and(eq(books.catalogId, catalogId), eq(books.deleted, false)));
	return rows[0] ?? null;
}

/**
 * Fetch book content (plain text, cover, chapters) by book id.
 * Returns undefined if the book or its content doesn't exist.
 *
 * `content` is read in chunks so a large book doesn't cross the Capacitor bridge
 * as one giant string (see long-text.ts). `wordIndex` is omitted here; callers
 * that need it use `loadBookWordIndex`, and folding it in would double the
 * chunked read for nothing.
 */
export async function getBookContent(id: string): Promise<BookContent | undefined> {
	const rows = await db
		.select({
			bookId: bookContent.bookId,
			coverImage: bookContent.coverImage,
			chapters: bookContent.chapters,
			linkRanges: bookContent.linkRanges,
		})
		.from(bookContent)
		.where(eq(bookContent.bookId, id));
	const row = rows[0];
	if (!row) return undefined;
	const content = await readLongText(
		longText,
		bookContent,
		bookContent.content,
		bookContent.bookId,
		id,
	);
	if (content === null) return undefined;
	return { ...row, content, wordIndex: null };
}

/**
 * Load and deserialize the persisted WordIndex blob for a book.
 *
 * Returns null when the blob is missing — happens for pre-Release-N books that
 * haven't been backfilled yet, or for `chapter_status != 'fetched'` rows that
 * have no content row. Callers should treat null as "not ready, retry later"
 * rather than as an empty book.
 *
 * Falls back to rebuilding from `content` if the blob is missing but content
 * exists — covers the brief window between import and the inline backfill on
 * commit, plus any corruption recovery.
 */
export async function loadBookWordIndex(id: string): Promise<WordIndex | null> {
	const content = await readLongText(
		longText,
		bookContent,
		bookContent.content,
		bookContent.bookId,
		id,
	);
	if (content === null) return null;
	// Oversized books store word_index = NULL (see commitBookContent); rebuild here.
	const wiJson = await readLongText(
		longText,
		bookContent,
		bookContent.wordIndex,
		bookContent.bookId,
		id,
	);
	if (wiJson) {
		try {
			return WordIndex.deserialize(JSON.parse(wiJson) as SerializedWordIndex, content);
		} catch {
			// Fall through to rebuild from content.
		}
	}
	return WordIndex.build(content);
}

/**
 * Parse the chapters JSON column into typed Chapter[].
 * Returns empty array if null or invalid.
 */
export function parseChapters(raw: string | null): Chapter[] {
	if (!raw) return [];
	try {
		return JSON.parse(raw) as Chapter[];
	} catch {
		return [];
	}
}

/**
 * Parse the linkRanges JSON column into typed LinkRange[].
 * Returns empty array if null or invalid.
 */
export function parseLinkRanges(raw: string | null): LinkRange[] {
	if (!raw) return [];
	try {
		return JSON.parse(raw) as LinkRange[];
	} catch {
		return [];
	}
}

type BookContentColumns = {
	coverImage: string | null;
	chapters: string | null;
	linkRanges: string | null;
	/** Serialized WordIndex, or null for oversized books (rebuilt on open). */
	wordIndexJson: string | null;
};

/**
 * Single writer for a book + its content row. Owns the chunked-write and
 * atomicity invariant so both import paths share it.
 *
 * `content` and `wordIndex` can each be tens of MB; writing them in one insert
 * OOMs the Capacitor bridge (see long-text.ts). When everything fits one bridge
 * chunk we keep the plain single insert (the common path, unchanged). Otherwise
 * we seed the row with the small columns and append the large ones in chunks. On
 * any failure both rows are deleted so a partial write doesn't orphan content.
 */
async function commitBookContent(
	book: NewBook,
	content: string,
	cols: BookContentColumns,
): Promise<void> {
	const { coverImage, chapters, linkRanges, wordIndexJson } = cols;
	const fitsOneChunk =
		content.length <= LONG_TEXT_CHUNK && (wordIndexJson?.length ?? 0) <= LONG_TEXT_CHUNK;

	try {
		await db.insert(books).values(book);
		if (fitsOneChunk) {
			await db.insert(bookContent).values({
				bookId: book.id,
				content,
				coverImage,
				chapters,
				wordIndex: wordIndexJson,
				linkRanges,
			});
			return;
		}
		await db.insert(bookContent).values({
			bookId: book.id,
			content: "",
			coverImage,
			chapters,
			wordIndex: wordIndexJson === null ? null : "",
			linkRanges,
		});
		await appendLongText(
			longText,
			bookContent,
			bookContent.content,
			bookContent.bookId,
			book.id,
			content,
		);
		if (wordIndexJson !== null) {
			await appendLongText(
				longText,
				bookContent,
				bookContent.wordIndex,
				bookContent.bookId,
				book.id,
				wordIndexJson,
			);
		}
	} catch (err) {
		await db
			.delete(bookContent)
			.where(eq(bookContent.bookId, book.id))
			.catch(() => {});
		await db
			.delete(books)
			.where(eq(books.id, book.id))
			.catch(() => {});
		throw err;
	}
}

/** Serialize the WordIndex unless the book is too large to sync. Oversized books
 *  store word_index = NULL and rebuild it on open, avoiding a ~100MB chunked blob. */
function wordIndexJsonFor(book: NewBook, wi: WordIndex): string | null {
	return (book.size ?? 0) > MAX_SYNCED_CONTENT_BYTES ? null : JSON.stringify(wi.serialize());
}

/**
 * Insert a new book with its content. The id (8-char hex) is part of the book param.
 */
export async function addBookWithContent(
	book: NewBook,
	content: string,
	coverImage?: string | null,
	importChapters?: ImportChapter[] | null,
	importLinks?: ImportLink[] | null,
): Promise<string> {
	// Build WordIndex once at import so chapter + link byte offsets convert to
	// word offsets in the same pass + the serialized blob lands in book_content
	// for fast reader open without a rebuild.
	const wi = WordIndex.build(content);
	const dbChapters: Chapter[] = (importChapters ?? []).map((ch) => ({
		title: ch.title,
		startWord: wi.wordOf(ch.startByte),
	}));
	const dbLinks: LinkRange[] = (importLinks ?? []).map((l) => ({
		href: l.href,
		...byteRangeToWordRange(wi, l.startByte, l.endByte),
	}));

	await commitBookContent({ ...book, wordCount: wi.wordCount }, content, {
		coverImage: coverImage ?? null,
		chapters: dbChapters.length ? JSON.stringify(dbChapters) : null,
		linkRanges: dbLinks.length ? JSON.stringify(dbLinks) : null,
		wordIndexJson: wordIndexJsonFor(book, wi),
	});

	return book.id;
}

/**
 * Pull-sync insert path. Server delivers chapters already in DB shape
 * ({title, startWord}); preserve the server's wordCount when available so
 * chapter offsets stay coherent across devices.
 */
export async function addServerBookWithContent(
	book: NewBook,
	content: string,
	coverImage?: string | null,
	chaptersJson?: string | null,
	linkRangesJson?: string | null,
): Promise<string> {
	const wi = WordIndex.build(content);
	const wordCount = book.wordCount && book.wordCount > 0 ? book.wordCount : wi.wordCount;
	await commitBookContent({ ...book, wordCount }, content, {
		coverImage: coverImage ?? null,
		chapters: chaptersJson ?? null,
		linkRanges: linkRangesJson ?? null,
		wordIndexJson: wordIndexJsonFor(book, wi),
	});
	return book.id;
}

/**
 * Partial update any book metadata fields by id.
 * Accepts any subset of Book columns (except id).
 *
 * Every call stamps `updated_at` with `occurredAt`, which is what makes an edit
 * visible to sync's last-write-wins. Pass `{ isDeviceLocal: true }` for a write
 * that must not claim a newer revision: one touching only device-local columns
 * (`isActive`, `filePath`), or one replaying a fact the server already holds
 * (the `finishedAt` catch-up in the sync pull). Either would otherwise win a
 * merge against a real edit made elsewhere.
 *
 * Examples:
 *   updateBook("a1b2c3d4", { filePath: "…" }, Date.now(), { isDeviceLocal: true })
 *   updateBook("a1b2c3d4", { title: "Morning Star" })
 *   updateBook("a1b2c3d4", { wordPosition: wordPos(1234), lastRead: Date.now() })
 */
export async function updateBook(
	id: string,
	data: Partial<Omit<NewBook, "id">>,
	/** When the change happened. Defaults to now, but the sync pull
	 *  replays changes made on another device at another time, and stamping
	 *  those with wall clock would date an old finish to today. */
	occurredAt: number = Date.now(),
	options: { isDeviceLocal?: boolean } = {},
): Promise<void> {
	const stamped: Partial<Omit<NewBook, "id">> = { ...data };
	// `updated_at` is the reading position's revision and nothing else: released
	// builds adopt the server's position whenever it is higher, so moving it for
	// a metadata edit would make them discard unpushed reading. Reader-editable
	// fields therefore carry their own stamp.
	const movesPosition = data.wordPosition !== undefined || data.lastRead !== undefined;
	const editsMetadata = METADATA_COLUMNS.some((column) => data[column] !== undefined);
	if (!options.isDeviceLocal && movesPosition && data.updatedAt === undefined) {
		stamped.updatedAt = occurredAt;
	}
	if (!options.isDeviceLocal && editsMetadata && data.metadataUpdatedAt === undefined) {
		stamped.metadataUpdatedAt = occurredAt;
	}
	// Stamp the first crossing of the finished threshold as the position moves.
	// Done in SQL rather than read-then-write because position saves are frequent
	// and every statement is a bridge round-trip. `finished_at` is only ever set,
	// never cleared: reopening a finished book does not unfinish it, which is the
	// whole reason the column exists.
	const patch: SQLiteUpdateSetSource<typeof books> =
		data.wordPosition !== undefined && data.finishedAt === undefined
			? {
					...stamped,
					finishedAt: sql`CASE
						WHEN ${books.finishedAt} IS NULL
							AND ${books.wordCount} > 0
							AND ${data.wordPosition} * 100 >= ${books.wordCount} * ${FINISHED_PERCENT_THRESHOLD}
						THEN ${occurredAt}
						ELSE ${books.finishedAt}
					END`,
				}
			: stamped;
	await db.update(books).set(patch).where(eq(books.id, id));
}

/**
 * Give books finished before the column existed a date, from the last time they
 * were read. Imprecise for a book reopened after finishing, but every device
 * derives the same answer from inputs that already sync, so they agree without
 * the backfill itself having to propagate.
 *
 * Falls back to `added_at` because a library restored from the server arrives
 * with `last_read` null and the pushing device's timestamp in `added_at` — the
 * devices that most need the backfill are the ones with no local read history.
 *
 * Idempotent: only ever fills nulls.
 */
export async function backfillFinishedAt(): Promise<void> {
	await db
		.update(books)
		.set({ finishedAt: sql`COALESCE(${books.lastRead}, ${books.addedAt})` })
		.where(
			and(
				isNull(books.finishedAt),
				// Chapter rows are excluded from the finished count, so stamping them
				// is write amplification on exactly the libraries with most rows.
				isNull(books.seriesId),
				gt(books.wordCount, 0),
				sql`${books.wordPosition} * 100 >= ${books.wordCount} * ${FINISHED_PERCENT_THRESHOLD}`,
			),
		);
}

/**
 * Mark one book as active and clear isActive on every other book.
 * Also resets position to 0 for the newly activated book.
 *
 * Two targeted UPDATE statements - no full table scan, no race window from
 * a fetch-then-fan-out pattern.
 *
 * `is_active` is device-local (which book sits on this ESP32) and never syncs,
 * so neither statement touches `updated_at`.
 */
export async function setActiveBook(id: string): Promise<void> {
	// Deactivate all others in one statement
	await db.update(books).set({ isActive: false }).where(ne(books.id, id));
	// Activate the target - preserve its current position (may have been read in-app)
	await db.update(books).set({ isActive: true }).where(eq(books.id, id));
}

/**
 * Soft-delete a book: drop content + highlights, keep the metadata row as a tombstone.
 *
 * The tombstone is pushed to the server on next sync, where it's promoted to a sticky
 * `deleted=true` row that prevents resurrection from any other device. After other
 * devices pull the tombstone, they hard-delete locally via `hardDeleteBook()`.
 *
 * NOTE: This only handles DB cleanup. To also delete the file from disk,
 * use the `removeBook()` function from the bookImport service instead.
 */
export async function deleteBook(id: string): Promise<void> {
	// Cascade book-scoped glossary entries; global ones (bookId IS NULL) survive
	await db.delete(glossaryEntries).where(eq(glossaryEntries.bookId, id));
	await db.delete(highlights).where(eq(highlights.bookId, id));
	await db.delete(bookContent).where(eq(bookContent.bookId, id));
	await db
		.update(books)
		.set({ deleted: true, isActive: false, updatedAt: Date.now() })
		.where(eq(books.id, id));
}

/**
 * Hard-delete the book row plus its content and highlights.
 * Used by sync pull when the server reports a tombstone — runs on devices that
 * didn't originate the delete and therefore still have the local rows.
 */
export async function hardDeleteBook(id: string): Promise<void> {
	await db.delete(glossaryEntries).where(eq(glossaryEntries.bookId, id));
	await db.delete(highlights).where(eq(highlights.bookId, id));
	await db.delete(bookContent).where(eq(bookContent.bookId, id));
	await db.delete(books).where(eq(books.id, id));
}
