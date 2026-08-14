/**
 * Folder-scan side of the import subsystem: what to do with one `ScannedFile`.
 *
 * Both entry points read the file, use it, and drop it. A scan holds hundreds
 * of `ScannedFile` handles, which are cheap; the bytes behind one are not, so
 * callers run these strictly one at a time.
 */

import type { BookProbe } from "@lesefluss/book-import";
import { probeBookMetadata } from "@lesefluss/book-import";
import type { Book } from "../db/schema";
import { parseAndCommit, pipelineOptions } from "./pipeline";
import { readScannedFile, type ScannedFile } from "./sources/folder-scan";

/**
 * Title, author, and cover for a review screen.
 *
 * Throws `FILE_TOO_LARGE` or `FILE_READ_FAILED` if the bytes cannot be read;
 * only the probe itself is total, degrading an unreadable book to its filename.
 */
export async function probeScannedFile(file: ScannedFile): Promise<BookProbe> {
	return probeBookMetadata(await readScannedFile(file), pipelineOptions);
}

/**
 * Parse and write one scanned file. No confirm sheet: a batch commits what the
 * reader selected, and they can edit any of it from the book detail page after.
 */
export async function importScannedFile(file: ScannedFile): Promise<Book> {
	return parseAndCommit(await readScannedFile(file));
}
