import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import {
	arrayBufferToBase64,
	type BookPayload,
	generateBookId,
	utf8ByteLength,
} from "@lesefluss/book-import";
import { log } from "../../utils/log";
import { queries } from "../db/queries";
import type { Book } from "../db/schema";
import type { ImportExtras } from "./types";

/** Directory within app data where original book files (EPUB, …) are stored. */
const BOOKS_DIR = "books";

/**
 * Chunk size for writing the original file. A multiple of 3 so each slice
 * base64-encodes to a self-contained block with no interior `=` padding, which
 * keeps the on-disk concatenation valid. Bounds peak base64 string size (~4MB)
 * instead of encoding the whole file into one ~67MB string.
 */
const CHUNK_BYTES = 3 * 1024 * 1024;

/**
 * Persist a parsed `BookPayload` to the database and (on native) save the
 * original file bytes to disk. Single writer for all import paths.
 */
export async function commitBook(payload: BookPayload, extras: ImportExtras): Promise<Book> {
	const id = generateBookId();
	const addedAt = Date.now();
	const size = utf8ByteLength(payload.content);

	await queries.addBookWithContent(
		{
			id,
			title: payload.title,
			author: payload.author ?? null,
			fileFormat: payload.fileFormat,
			filePath: null,
			size,
			isActive: false,
			addedAt,
			lastRead: null,
			source: extras.source ?? null,
			catalogId: extras.catalogId ?? null,
			sourceUrl: extras.sourceUrl ?? null,
		},
		payload.content,
		payload.coverImage ?? null,
		payload.chapters ?? null,
		payload.linkRanges ?? null,
	);

	if (payload.original && Capacitor.isNativePlatform()) {
		const filePath = `${BOOKS_DIR}/${id}.${payload.original.extension}`;
		try {
			await ensureBooksDir();
			await writeFileInChunks(filePath, payload.original.bytes);
			await queries.updateBook(id, { filePath });
		} catch (err) {
			// The book row + content are already committed and fully readable; the
			// original file is only kept for re-parse. A partial chunked write would
			// leave a corrupt file, so drop it and keep the book without a filePath
			// (same state as txt imports, which never store an original).
			log.warn("book-import", "Failed to save original file; keeping book without it:", err);
			await Filesystem.deleteFile({ path: filePath, directory: Directory.Data }).catch(() => {});
		}
	}

	const stored = await queries.getBook(id);
	if (!stored) throw new Error(`commitBook: ${id} disappeared after insert`);
	return stored;
}

/**
 * Remove a book: delete the file from disk (if it exists) then delete DB rows.
 */
export async function removeBook(book: Pick<Book, "id" | "filePath">): Promise<void> {
	if (book.filePath) {
		try {
			await Filesystem.deleteFile({
				path: book.filePath,
				directory: Directory.Data,
			});
		} catch (err) {
			log.warn("book-import", "Failed to delete book file:", err);
		}
	}

	await queries.deleteBook(book.id);
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
