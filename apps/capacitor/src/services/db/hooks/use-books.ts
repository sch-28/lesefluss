import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	importBook,
	importBookFromClipboard,
	importBookFromText,
	importBookFromUrl,
	removeBook,
} from "../../book-import";
import { scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
import type { Book } from "../schema";
import { bookKeys } from "./query-keys";

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * All books list + their cover images, fetched in parallel.
 *
 * Returns `{ books: Book[], covers: Map<string, string> }`.
 * Combined into one hook because they're always rendered together in the
 * library grid - avoids two separate loading states.
 */
function useBooks() {
	return useQuery({
		queryKey: bookKeys.all,
		queryFn: async () => {
			const [books, covers] = await Promise.all([queries.getBooks(), queries.getBookCovers()]);
			return { books, covers };
		},
	});
}

/**
 * Single book metadata by id.
 * Enabled only when `id` is non-empty.
 */
function useBook(id: string) {
	return useQuery({
		queryKey: bookKeys.detail(id),
		queryFn: () => queries.getBook(id),
		enabled: !!id,
	});
}

/**
 * Book content (large text, cover base64, chapters JSON) by id.
 * Kept in a separate query from metadata so the heavy content blob is only
 * loaded when entering the reader - not when rendering the library grid.
 * Enabled only when `id` is non-empty.
 */
function useBookContent(id: string) {
	return useQuery({
		queryKey: bookKeys.content(id),
		queryFn: () => queries.getBookContent(id),
		enabled: !!id,
	});
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Shared plumbing for every "import a book" mutation: invalidate the library
 * + cover queries and nudge the sync scheduler on success. Every new source
 * (file picker, clipboard, URL, share, future PDF, …) should go through this
 * factory instead of reinventing the onSuccess block.
 */
function useBookImportMutation<TVars = void>(mutationFn: (vars: TVars) => Promise<Book>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			scheduleSyncPush();
		},
	});
}

/**
 * Import from the file picker. `onProgress` is plumbed through so the caller
 * can drive a progress bar during EPUB spine processing.
 * `importBook` throws `Error("CANCELLED")` on picker dismissal — callers treat
 * that as a silent no-op.
 */
function useImportBook() {
	return useBookImportMutation(
		({ onProgress }: { onProgress?: (pct: number) => void }) => importBook(onProgress),
	);
}

/**
 * Import from the system clipboard. Throws `Error("EMPTY")` when the
 * clipboard has no usable text — callers surface this as a toast.
 */
function useImportBookFromClipboard() {
	return useBookImportMutation(() => importBookFromClipboard());
}

/**
 * Import from a URL (fetched via the catalog proxy + extracted with
 * Readability). See `sources/url.ts` for the error contract.
 */
function useImportBookFromUrl() {
	return useBookImportMutation(({ url }: { url: string }) => importBookFromUrl(url));
}

/**
 * Import from a plain-text string (e.g. share-intent plain text).
 */
function useImportBookFromText() {
	return useBookImportMutation(
		({ text, hint }: { text: string; hint?: { title?: string } }) =>
			importBookFromText(text, hint),
	);
}

/**
 * Delete a book (disk file + both DB rows).
 *
 * Usage:
 *   const deleteBook = queryHooks.useDeleteBook();
 *   deleteBook.mutate(book);
 *
 * On success, removes the specific detail + content entries from the cache and
 * invalidates the list so the library grid re-renders without the deleted book.
 */
function useDeleteBook() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (book: Pick<Book, "id" | "filePath">) => removeBook(book),
		onSuccess: (_data, book) => {
			qc.removeQueries({ queryKey: bookKeys.detail(book.id) });
			qc.removeQueries({ queryKey: bookKeys.content(book.id) });
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			scheduleSyncPush();
		},
	});
}

// ─── Exported object ─────────────────────────────────────────────────────────

export const bookHooks = {
	useBooks,
	useBook,
	useBookContent,
	useImportBook,
	useImportBookFromClipboard,
	useImportBookFromUrl,
	useImportBookFromText,
	useDeleteBook,
};
