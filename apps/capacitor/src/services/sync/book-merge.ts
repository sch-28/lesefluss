import { type SyncBook, wordPos } from "@lesefluss/core";
import type { Book, NewBook } from "../db/schema";

/** Revision of the server's reader-editable fields. A row last written by a
 *  client that pre-dates the column has none, so fall back to the row revision. */
export function serverMetadataStamp(serverBook: SyncBook): number {
	return serverBook.metadataUpdatedAt ?? serverBook.updatedAt;
}

/** Every column a merge can write; `applyBookMerge` guards each by its own stamp. */
export type BookMergeUpdate = Partial<
	Pick<
		NewBook,
		| "addedAt"
		| "wordPosition"
		| "updatedAt"
		| "lastRead"
		| "wordCount"
		| "metadataUpdatedAt"
		| "title"
		| "author"
		| "description"
		| "language"
		| "status"
		| "rating"
		| "review"
		| "tags"
		| "hideFromProfile"
	>
>;

/**
 * What to write locally when the server's copy of a book we already have is the
 * newer one, or null when it isn't. Pure so the merge rules can be tested
 * without a database.
 *
 * Three independent gates. `updatedAt` is the reading position's revision, which
 * is what every released build takes it to mean, so the position merges on it
 * exactly as before. The reader-editable fields merge on `metadataUpdatedAt`,
 * which is the only stamp an edit moves; that separation is what keeps an older
 * build from mistaking a rating for reading and discarding a newer position. The
 * add date merges on no stamp at all, being a fact rather than a revision: the
 * earliest wins, so a device that restored the library and stamped itself into
 * the date recovers the original from one that still holds it.
 *
 * `undefined` on a metadata field means the pushing client pre-dates that
 * column and is not claiming anything about it; `null` means the reader cleared
 * it. Only the second is written.
 */
export function buildBookMergeUpdate(local: Book, serverBook: SyncBook): BookMergeUpdate | null {
	const positionIsNewer = serverBook.updatedAt > local.updatedAt;
	const metadataIsNewer = serverMetadataStamp(serverBook) > local.metadataUpdatedAt;
	const earlierAddedAt =
		serverBook.addedAt != null && serverBook.addedAt < local.addedAt ? serverBook.addedAt : null;
	if (!positionIsNewer && !metadataIsNewer && earlierAddedAt == null) return null;

	const update: BookMergeUpdate = {};
	if (earlierAddedAt != null) update.addedAt = earlierAddedAt;
	if (positionIsNewer) {
		update.wordPosition = wordPos(serverBook.wordPosition);
		update.updatedAt = serverBook.updatedAt;
		// Never backwards: `commitChapter` moves `lastRead` without the position,
		// so the server's stamp can trail ours, and a regression here re-sorts the
		// library (`getBooks` orders by `lastRead desc`).
		update.lastRead = Math.max(local.lastRead ?? 0, serverBook.updatedAt);
		// Refresh wordCount when the server has a definitive value so
		// chapter/highlight bounds derived from it stay coherent. Skipping
		// this leaves local count stale after a server-side content refresh.
		if (serverBook.wordCount != null && serverBook.wordCount !== local.wordCount) {
			update.wordCount = serverBook.wordCount;
		}
	}
	if (!metadataIsNewer) return update;
	update.metadataUpdatedAt = serverMetadataStamp(serverBook);
	if (serverBook.title !== local.title) update.title = serverBook.title;
	if (serverBook.author !== local.author) update.author = serverBook.author;
	if (serverBook.description !== undefined) update.description = serverBook.description;
	if (serverBook.language !== undefined) update.language = serverBook.language;
	if (serverBook.status !== undefined) update.status = serverBook.status;
	if (serverBook.rating !== undefined) update.rating = serverBook.rating;
	if (serverBook.review !== undefined) update.review = serverBook.review;
	if (serverBook.tags !== undefined) update.tags = serverBook.tags;
	if (serverBook.hideFromProfile !== undefined) update.hideFromProfile = serverBook.hideFromProfile;
	return update;
}
