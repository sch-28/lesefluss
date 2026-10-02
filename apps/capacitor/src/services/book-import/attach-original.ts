import { Capacitor } from "@capacitor/core";
import { type BookPayload, utf8ByteLength } from "@lesefluss/book-import";
import { WordIndex } from "@lesefluss/core";
import { log } from "../../utils/log";
import { queries } from "../db/queries";
import type { Book } from "../db/schema";
import { reportEvent } from "../telemetry";
import { isSavingOriginal, saveOriginalFile } from "./commit";
import { patchCachedAnchors, storeBookImages } from "./store-images";

/**
 * The library book this payload is the original file of, if any: same text
 * and no original on this device. `size` is the content's byte length on
 * every import path and through sync; legacy server rows carry 0 and fall
 * back to the word count. On the web build there is no file to gain, so a
 * book that already has images is not offered again.
 */
export async function findAttachCandidate(payload: BookPayload): Promise<Book | null> {
	if (payload.fileFormat !== "epub") return null;
	const native = Capacitor.isNativePlatform();
	const size = utf8ByteLength(payload.content);
	let wordCount: number | null = null;
	for (const book of await queries.getBooks()) {
		if (book.filePath || isSavingOriginal(book.id)) continue;
		if (book.size !== size) {
			if (book.size !== 0 || book.wordCount === 0) continue;
			wordCount ??= WordIndex.build(payload.content).wordCount;
			if (book.wordCount !== wordCount) continue;
		}
		const stored = await queries.getBookContent(book.id);
		if (!stored || stored.content !== payload.content) continue;
		if (!native && queries.parseImageAnchors(stored.imageAnchors).length > 0) continue;
		return book;
	}
	return null;
}

/**
 * Give an existing book the images and original file of a payload whose text
 * is byte-identical to its stored content. Nothing sync sees changes.
 * Anchors land before the file so an open reader never sees an EPUB with an
 * original and no anchor column, which would start the upgrade re-parse.
 * `fileCopyFailed` is true when the copy was attempted and did not land; the
 * book then keeps its images but cannot repair them later.
 */
export async function attachOriginalToBook(
	book: Pick<Book, "id">,
	payload: BookPayload,
	options: { awaitBackgroundWork?: boolean } = {},
): Promise<{ fileCopyFailed: boolean }> {
	const wi = await queries.loadBookWordIndex(book.id);
	if (!wi) throw new Error(`attachOriginalToBook: ${book.id} has no word index`);
	const anchors = payload.imageAnchors ?? [];
	patchCachedAnchors(book.id, await queries.setBookImageAnchors(book.id, anchors, wi));
	let fileCopyFailed = false;
	if (payload.original && Capacitor.isNativePlatform()) {
		fileCopyFailed =
			(await saveOriginalFile(book.id, payload.original, payload.fileFormat)) === null;
		if (fileCopyFailed) reportEvent("book_original_attach_error");
	}
	const images = payload.images ?? [];
	log(
		"book-import",
		`attached original to ${book.id}: ${anchors.length} anchors, ${images.length} images${
			fileCopyFailed ? ", file copy failed" : ""
		}`,
	);
	if (images.length > 0) {
		const backgroundWork = storeBookImages(book.id, images, "book_images_attach_error");
		if (options.awaitBackgroundWork) await backgroundWork;
	}
	return { fileCopyFailed };
}
