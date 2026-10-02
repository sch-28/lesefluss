import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import {
	arrayBufferToBase64,
	type BookPayload,
	generateBookId,
	normalizeCoverDataUrl,
	utf8ByteLength,
} from "@lesefluss/book-import";
import { FIELD_LIMITS } from "../../pages/library/book-fields";
import { log } from "../../utils/log";
import { queries } from "../db/queries";
import type { Book, NewBook } from "../db/schema";
import { storeBookImages } from "./store-images";
import type { ImportExtras, ImportOverrides } from "./types";

/** Directory within app data where original book files (EPUB, …) are stored. */
const BOOKS_DIR = "books";

/**
 * Chunk size for writing the original file. A multiple of 3 so each slice
 * base64-encodes to a self-contained block with no interior `=` padding, which
 * keeps the on-disk concatenation valid. Bounds peak base64 string size (~4MB)
 * instead of encoding the whole file into one ~67MB string.
 */
const CHUNK_BYTES = 3 * 1024 * 1024;

const savingOriginal = new Set<string>();

export function isSavingOriginal(id: string): boolean {
	return savingOriginal.has(id);
}

/**
 * The `books` row an import produces. Pure, so the precedence between what the
 * parser guessed and what the reader corrected is testable without a database.
 *
 * `overrides` come from the confirm sheet and win outright: the reader saw the
 * parser's guess and changed it. An import that commits without being shown
 * (the catalog) passes none, and the parser's values stand.
 */
export function buildImportedBookRow(
	payload: BookPayload,
	extras: ImportExtras,
	overrides: ImportOverrides | undefined,
	stamps: { id: string; addedAt: number; size: number },
): NewBook {
	const { id, addedAt, size } = stamps;
	return {
		id,
		title: overrides?.title ?? payload.title,
		author: overrides ? overrides.author : (payload.author ?? null),
		description: overrides?.description ?? null,
		// Same shape as `author` above: when the confirm sheet was shown, its value
		// wins outright, including a deliberate clearing to null. Only an import
		// that skipped the sheet falls back to the service, then the file itself.
		// Capped like sourceUrl below - one over-long field 400s the entire sync
		// snapshot, not just this book.
		language:
			(overrides ? overrides.language : (extras.language ?? payload.language ?? null))?.slice(
				0,
				FIELD_LIMITS.language,
			) ?? null,
		status: overrides?.status ?? null,
		rating: overrides?.rating ?? null,
		review: overrides?.review ?? null,
		tags: overrides?.tags ?? null,
		fileFormat: payload.fileFormat,
		filePath: null,
		size,
		isActive: false,
		addedAt,
		updatedAt: addedAt,
		metadataUpdatedAt: addedAt,
		lastRead: null,
		source: extras.source ?? null,
		catalogId: extras.catalogId ?? null,
		// Capped to what SyncBookSchema accepts: one over-long redirect target
		// would otherwise fail the whole push payload, not just this book.
		sourceUrl: extras.sourceUrl?.slice(0, 2000) ?? null,
	};
}

/**
 * Persist a parsed `BookPayload` to the database and (on native) save the
 * original file bytes to disk. Single writer for all import paths.
 */
export async function commitBook(
	payload: BookPayload,
	extras: ImportExtras,
	/** Reader's corrections from the confirm sheet, applied over what the parser
	 *  guessed. Absent when an import commits without being shown. */
	overrides?: ImportOverrides,
	options: { awaitBackgroundWork?: boolean } = {},
): Promise<Book> {
	const id = generateBookId();
	const addedAt = Date.now();
	const size = utf8ByteLength(payload.content);

	const coverImage = await normalizeCoverDataUrl(payload.coverImage ?? null);
	const startedAt = performance.now();
	await queries.addBookWithContent(
		buildImportedBookRow(payload, extras, overrides, { id, addedAt, size }),
		payload.content,
		coverImage,
		payload.chapters ?? null,
		payload.linkRanges ?? null,
		payload.fileFormat === "epub" ? (payload.imageAnchors ?? []) : null,
	);
	log(
		"book-import",
		`committed ${id}: ${size} bytes in ${Math.round(performance.now() - startedAt)} ms`,
	);

	// The book is readable now. The original file copy and the image rows are
	// megabytes over the native bridge, so they land after the confirm sheet
	// has closed rather than keeping the reader waiting on them. A caller with
	// no sheet (folder scan, catalog) waits instead, which also keeps one
	// payload's bytes alive at a time.
	const backgroundWork = finishImportInBackground(id, payload);
	if (options.awaitBackgroundWork) await backgroundWork;

	const stored = await queries.getBook(id);
	if (!stored) throw new Error(`commitBook: ${id} disappeared after insert`);
	return stored;
}

async function finishImportInBackground(id: string, payload: BookPayload): Promise<void> {
	if (payload.original && Capacitor.isNativePlatform()) {
		await saveOriginalFile(id, payload.original);
	}
	const images = payload.images ?? [];
	if (images.length === 0) return;
	const startedAt = performance.now();
	const written = await storeBookImages(id, images, "book_images_write_error");
	log(
		"book-import",
		`stored ${written}/${images.length} images for ${id} (${Math.round(
			images.reduce((sum, img) => sum + img.dataUrl.length, 0) / 1024,
		)} KB base64) in ${Math.round(performance.now() - startedAt)} ms`,
	);
}

/**
 * Copy the original file into app storage and record it on the row. Returns
 * the stored path, or null when the book is gone or the copy failed.
 */
export async function saveOriginalFile(
	id: string,
	original: NonNullable<BookPayload["original"]>,
	fileFormat?: NewBook["fileFormat"],
): Promise<string | null> {
	const filePath = `${BOOKS_DIR}/${id}.${original.extension}`;
	savingOriginal.add(id);
	try {
		await ensureBooksDir();
		await writeFileInChunks(filePath, original.bytes);
		// The copy runs after the commit returned, so the reader may have deleted
		// the book meanwhile; a file recorded on a tombstone would never be unlinked.
		const book = await queries.getBook(id);
		if (!book || book.deleted) {
			await Filesystem.deleteFile({ path: filePath, directory: Directory.Data }).catch(() => {});
			return null;
		}
		// The original file lives on this device only, so recording it must not
		// make the row look freshly edited to sync.
		await queries.updateBook(id, { fileFormat, filePath }, Date.now(), { isDeviceLocal: true });
		return filePath;
	} catch (err) {
		// The book row + content are already committed and fully readable; the
		// original file is only kept for re-parse. A partial chunked write would
		// leave a corrupt file, so drop it and keep the book without a filePath
		// (same state as txt imports, which never store an original).
		log.warn("book-import", "Failed to save original file; keeping book without it:", err);
		await Filesystem.deleteFile({ path: filePath, directory: Directory.Data }).catch(() => {});
		return null;
	} finally {
		savingOriginal.delete(id);
	}
}

/**
 * Remove a book: delete the file from disk (if it exists) then delete DB rows.
 */
export async function removeBook(book: Pick<Book, "id" | "filePath">): Promise<void> {
	// The caller's row may predate a file that landed later (deferred copy,
	// attach), and a file recorded on a tombstone would never be unlinked.
	const filePath = (await queries.getBook(book.id))?.filePath ?? book.filePath;
	// Rows first. `deleteBook` can throw, and unlinking ahead of it would leave a
	// book that still exists with its only local copy gone, so it could neither
	// be opened nor re-parsed. A file left behind by a failed delete is just
	// wasted space, and the retry removes it.
	await queries.deleteBook(book.id);

	if (filePath) {
		try {
			await Filesystem.deleteFile({
				path: filePath,
				directory: Directory.Data,
			});
		} catch (err) {
			log.warn("book-import", "Failed to delete book file:", err);
		}
	}
}

/**
 * Write `bytes` to `path` under `Directory.Data` in base64 chunks. The first
 * chunk creates/replaces the file, the rest append, so peak memory stays bounded
 * by `CHUNK_BYTES` rather than the whole file.
 */
async function writeFileInChunks(path: string, bytes: ArrayBuffer): Promise<void> {
	for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
		const slice = bytes.slice(offset, offset + CHUNK_BYTES);
		const data = arrayBufferToBase64(slice);
		if (offset === 0) {
			await Filesystem.writeFile({ path, data, directory: Directory.Data });
		} else {
			await Filesystem.appendFile({ path, data, directory: Directory.Data });
		}
	}
}

async function ensureBooksDir(): Promise<void> {
	try {
		await Filesystem.mkdir({
			path: BOOKS_DIR,
			directory: Directory.Data,
			recursive: true,
		});
	} catch {
		// Directory may already exist - that's fine
	}
}
