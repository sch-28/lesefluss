import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { log } from "../../utils/log";
import { queries } from "../db/queries";
import type { Book } from "../db/schema";
import type { BookPayload, ImportExtras } from "./types";
import { arrayBufferToBase64, utf8ByteLength } from "./utils/encoding";
import { generateBookId } from "./utils/id";

/** Directory within app data where original book files (EPUB, …) are stored. */
const BOOKS_DIR = "books";

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
			position: 0,
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
	);

	let filePath: string | null = null;
	if (payload.original && Capacitor.isNativePlatform()) {
		filePath = `${BOOKS_DIR}/${id}.${payload.original.extension}`;
		await ensureBooksDir();
		await Filesystem.writeFile({
			path: filePath,
			data: arrayBufferToBase64(payload.original.bytes),
			directory: Directory.Data,
		});
		await queries.updateBook(id, { filePath });
	}

	return {
		id,
		title: payload.title,
		author: payload.author ?? null,
		fileFormat: payload.fileFormat,
		filePath,
		size,
		position: 0,
		isActive: false,
		addedAt,
		lastRead: null,
		source: extras.source ?? null,
		catalogId: extras.catalogId ?? null,
		sourceUrl: extras.sourceUrl ?? null,
	};
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
