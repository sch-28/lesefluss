import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { importBook, removeBook } from "../../book-import";
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
 * library grid — avoids two separate loading states.
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
 * loaded when entering the reader — not when rendering the library grid.
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
 * Import a book from the file picker.
 *
 * Usage:
 *   const importBook = queryHooks.useImportBook();
 *   importBook.mutate({ onProgress: (pct) => setProgress(pct) });
 *
 * On success, invalidates `bookKeys.all` and `bookKeys.covers` so the library
 * grid refreshes automatically.
 *
 * The `onProgress` callback is passed as part of mutation variables so the
 * caller can drive a progress bar during EPUB spine processing.
 * `importBook` throws `Error("CANCELLED")` if the user dismissed the picker —
 * this is treated as a non-error and silently ignored in `onError`.
 */
function useImportBook() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ onProgress }: { onProgress?: (pct: number) => void }) => importBook(onProgress),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			scheduleSyncPush();
		},
	});
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
	useDeleteBook,
};
