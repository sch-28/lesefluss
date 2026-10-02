import { Capacitor } from "@capacitor/core";
import {
	type ImportImage,
	type ImportImageAnchor,
	runImportPipeline,
} from "@lesefluss/book-import";
import type { WordIndex } from "@lesefluss/core";
import { log } from "../../utils/log";
import { bookKeys } from "../db/hooks/query-keys";
import { queries } from "../db/queries";
import type { Book, BookContent } from "../db/schema";
import { queryClient } from "../query-client";
import { errorMessage, reportEvent } from "../telemetry";
import { pipelineOptions } from "./pipeline";
import { readOriginalFile } from "./sources/read-file";
import { storeBookImages } from "./store-images";

const attempted = new Set<string>();

/**
 * An EPUB imported before images were captured: no anchor column yet (a
 * checked book has at least `[]`), and the original file to read them from.
 * Transition aid for libraries that pre-date image support; once those have
 * been opened, this can go.
 */
export function needsImageUpgrade(
	book: Pick<Book, "fileFormat" | "filePath">,
	imageAnchorsColumn: string | null,
): boolean {
	return (
		Capacitor.isNativePlatform() &&
		book.fileFormat === "epub" &&
		!!book.filePath &&
		imageAnchorsColumn === null
	);
}

type ReparsedImages = {
	content: string;
	images: ImportImage[];
	imageAnchors: ImportImageAnchor[];
};

/** Re-parse the original file for its images. Its own frame, so the file
 *  bytes and the parser payload are released before the rows are written. */
async function reparseImages(filePath: string, bookId: string): Promise<ReparsedImages> {
	const bytes = await readOriginalFile(filePath);
	const payload = await runImportPipeline(
		{ kind: "bytes", bytes, fileName: `${bookId}.epub`, mimeType: "application/epub+zip" },
		pipelineOptions,
	);
	return {
		content: payload.content,
		images: payload.images ?? [],
		imageAnchors: payload.imageAnchors ?? [],
	};
}

function patchCachedAnchors(bookId: string, imageAnchors: string): void {
	queryClient.setQueryData<BookContent | undefined>(bookKeys.content(bookId), (old) =>
		old ? { ...old, imageAnchors } : old,
	);
}

/**
 * Add anchors and images to an existing book when its re-parsed text is
 * byte-identical to the stored content. Nothing else about the book changes,
 * so position, sessions, highlights and sync are unaffected. A text mismatch
 * (older parser output) marks the book as checked and leaves it without images.
 */
export async function upgradeBookImages(
	book: Pick<Book, "id" | "filePath">,
	content: string,
	wordIndex: WordIndex,
): Promise<void> {
	if (!book.filePath || attempted.has(book.id)) return;
	attempted.add(book.id);
	try {
		const reparsed = await reparseImages(book.filePath, book.id);
		if (reparsed.content !== content) {
			log.warn("book-import", `image upgrade skipped for ${book.id}: re-parsed text differs`);
			reportEvent("book_images_upgrade_mismatch");
			patchCachedAnchors(book.id, await queries.setBookImageAnchors(book.id, [], wordIndex));
			return;
		}
		const json = await queries.setBookImageAnchors(book.id, reparsed.imageAnchors, wordIndex);
		patchCachedAnchors(book.id, json);
		const written = reparsed.images.length
			? await storeBookImages(book.id, reparsed.images, "book_images_upgrade_error")
			: 0;
		log(
			"book-import",
			`image upgrade for ${book.id}: ${reparsed.imageAnchors.length} anchors, ${written} images`,
		);
	} catch (err) {
		log.warn("book-import", `image upgrade failed for ${book.id}:`, err);
		reportEvent("book_images_upgrade_error", { message: errorMessage(err) });
	}
}
