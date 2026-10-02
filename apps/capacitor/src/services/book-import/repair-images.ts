import { Capacitor } from "@capacitor/core";
import type { ImportImage } from "@lesefluss/book-import";
import { loadEpubImages } from "@lesefluss/book-import/parsers/epub";
import { log } from "../../utils/log";
import type { Book, ImageAnchor } from "../db/schema";
import { errorMessage, reportEvent } from "../telemetry";
import { prepareImageOffThread } from "./image-prepare";
import { readOriginalFile } from "./sources/read-file";
import { isStoringImages, storeBookImages } from "./store-images";

/** Books repaired (or found not repairable) since the app started. Images that
 *  were skipped at import on purpose would otherwise cost a zip read per open. */
const attempted = new Set<string>();

export function missingImageKeys(
	anchors: readonly ImageAnchor[],
	storedKeys: readonly string[],
): string[] {
	const stored = new Set(storedKeys);
	return [...new Set(anchors.map((a) => a.key))].filter((key) => !stored.has(key));
}

/**
 * Write the image rows a book is missing, from its original EPUB on disk. The
 * rows are normally written in the background right after import; an app
 * killed mid-write leaves anchors without rows. Nothing happens on the web
 * build (no original file), for books without one, or twice per session.
 */
export async function repairMissingImages(
	book: Pick<Book, "id" | "filePath">,
	anchors: readonly ImageAnchor[],
	storedKeys: readonly string[],
): Promise<void> {
	if (!Capacitor.isNativePlatform() || !book.filePath || attempted.has(book.id)) return;
	// Rows still landing from the import are not missing; the reader refreshes
	// as they arrive, and a repair now would read the whole file back for nothing.
	if (isStoringImages(book.id)) return;
	const missing = missingImageKeys(anchors, storedKeys);
	if (missing.length === 0) return;
	attempted.add(book.id);
	let images: ImportImage[];
	try {
		const bytes = await readOriginalFile(book.filePath);
		images = await loadEpubImages(bytes, missing, prepareImageOffThread);
	} catch (err) {
		log.warn("book-import", `image repair failed for ${book.id}:`, err);
		reportEvent("book_images_repair_error", { message: errorMessage(err) });
		return;
	}
	const written = await storeBookImages(book.id, images, "book_images_repair_error");
	log("book-import", `repaired ${written}/${missing.length} missing images for ${book.id}`);
}
