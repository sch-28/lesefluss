import type { ImportImage } from "@lesefluss/book-import";
import { log } from "../../utils/log";
import { bookKeys } from "../db/hooks/query-keys";
import { queries } from "../db/queries";
import type { BookContent } from "../db/schema";
import { queryClient } from "../query-client";
import { errorMessage, reportEvent } from "../telemetry";

/** Reader-visible figures appear in batches while a long book is still landing. */
const REFRESH_EVERY = 8;

const inFlight = new Set<string>();

/** Keep an open reader's content row in step without refetching the whole text. */
export function patchCachedAnchors(bookId: string, imageAnchors: string): void {
	queryClient.setQueryData<BookContent | undefined>(bookKeys.content(bookId), (old) =>
		old ? { ...old, imageAnchors } : old,
	);
}

/** Whether a background image write for this book is still running. */
export function isStoringImages(bookId: string): boolean {
	return inFlight.has(bookId);
}

/**
 * Write a book's image rows in the background and keep an open reader in
 * step. A failure is a cosmetic loss (the book is already readable and the
 * reader renders nothing for a missing row), so it is logged and reported,
 * never thrown. Returns the number of rows written.
 */
export async function storeBookImages(
	bookId: string,
	images: readonly ImportImage[],
	errorEvent: string,
): Promise<number> {
	const refresh = () => queryClient.invalidateQueries({ queryKey: bookKeys.images(bookId) });
	inFlight.add(bookId);
	try {
		return await queries.addBookImages(bookId, images, (count) => {
			if (count % REFRESH_EVERY === 0) void refresh();
		});
	} catch (err) {
		log.warn("book-import", `${errorEvent} for ${bookId}:`, err);
		reportEvent(errorEvent, { message: errorMessage(err) });
		return 0;
	} finally {
		inFlight.delete(bookId);
		void refresh();
	}
}
