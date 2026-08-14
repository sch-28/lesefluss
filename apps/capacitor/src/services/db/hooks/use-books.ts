import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../../components/toast";
import type { StagedImport } from "../../book-import";
import {
	parseBookFromBlob,
	parseBookFromClipboard,
	parseBookFromFile,
	parseBookFromText,
	parseBookFromUrl,
	removeBook,
} from "../../book-import";
import { importSerialFromUrl } from "../../serial-scrapers";
import { scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
import type { Book, Series } from "../schema";
import { bookImportMutationKey, bookKeys, serialKeys, statsKeys } from "./query-keys";

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

/**
 * Deserialized WordIndex for a book (ADR-0002 canonical position lookup).
 * Returns null while loading or when the book has no content yet (pending
 * chapter, fresh import before backfill commit). Cached per bookId.
 */
function useBookWordIndex(id: string) {
	return useQuery({
		queryKey: bookKeys.wordIndex(id),
		queryFn: () => queries.loadBookWordIndex(id),
		enabled: !!id,
		staleTime: Number.POSITIVE_INFINITY,
	});
}

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Shared plumbing for every import mutation: one mutation key, so the library
 * can show a global progress bar while any import is in flight.
 *
 * Deliberately no invalidation of its own. A book import PARSES here and is
 * written later by the staging provider, which invalidates when the write
 * actually happens; the one import that still writes directly (serials) passes
 * its own `onSuccess`.
 */
function useBookImportMutation<TVars = void, TResult = StagedImport>(
	mutationFn: (vars: TVars) => Promise<TResult>,
	options?: { onSuccess: () => void },
) {
	return useMutation({
		mutationKey: bookImportMutationKey,
		mutationFn,
		onSuccess: options?.onSuccess,
	});
}

/**
 * Parse a file from the picker. Nothing is written: the caller stages the
 * result for confirmation. `onProgress` is plumbed through so the caller can
 * drive a progress bar during EPUB spine processing.
 * `parseBookFromFile` throws `Error("CANCELLED")` on picker dismissal, which
 * callers treat as a silent no-op.
 */
function useImportBook() {
	return useBookImportMutation(({ onProgress }: { onProgress?: (pct: number) => void }) =>
		parseBookFromFile(onProgress),
	);
}

/**
 * Import from the system clipboard. Throws `Error("EMPTY")` when the
 * clipboard has no usable text — callers surface this as a toast.
 */
function useImportBookFromClipboard() {
	return useBookImportMutation(() => parseBookFromClipboard());
}

/**
 * Import from a URL (fetched via the catalog proxy + extracted with
 * Readability). See `sources/url.ts` for the error contract.
 */
function useImportBookFromUrl() {
	return useBookImportMutation(({ url }: { url: string }) => parseBookFromUrl(url));
}

/**
 * Import a serial/web-novel from any URL within the series. Inserts a series
 * row plus N pending chapter rows; chapters fetch lazily on reader open.
 *
 * Invalidates the serial subtree on top of the default book invalidations so
 * the library's series cards and chapter-count badges refresh immediately —
 * no app reload needed.
 *
 * Throws `Error("NO_SCRAPER")` for non-serial URLs (caller should branch on
 * `isSerialUrl` first to avoid this).
 */
function useImportSerialFromUrl() {
	const qc = useQueryClient();
	return useBookImportMutation<{ url: string }, Series>(({ url }) => importSerialFromUrl(url), {
		// Serials write on success, so this is where their rows appear.
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			qc.invalidateQueries({ queryKey: serialKeys.all });
			scheduleSyncPush();
		},
	});
}

/**
 * Import from a plain-text string (e.g. share-intent plain text).
 */
function useImportBookFromText() {
	return useBookImportMutation(({ text, hint }: { text: string; hint?: { title?: string } }) =>
		parseBookFromText(text, hint),
	);
}

/**
 * Import from an in-memory Blob (e.g. a file received via "Open with" /
 * share-sheet that the native plugin copied to app cache).
 */
function useImportBookFromBlob() {
	return useBookImportMutation(({ blob, fileName }: { blob: Blob; fileName: string }) =>
		parseBookFromBlob(blob, fileName),
	);
}

/**
 * Save reader-edited metadata for a book.
 *
 * Usage:
 *   const updateBook = queryHooks.useUpdateBook();
 *   updateBook.mutate({ id, values: { title: "Morning Star" } });
 *
 * The write lands in SQLite whether or not an account exists; `scheduleSyncPush`
 * is a no-op when signed out, and the row's `updated_at` carries the edit to the
 * server whenever one appears.
 */
function useUpdateBook() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, values }: { id: string; values: Partial<Omit<Book, "id">> }) =>
			queries.updateBook(id, values),
		onSuccess: (_data, { id }) => {
			qc.invalidateQueries({ queryKey: bookKeys.detail(id) });
			qc.invalidateQueries({ queryKey: bookKeys.all });
			scheduleSyncPush();
		},
		onError: () => toast.error("Couldn't save your changes"),
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
		mutationFn: (book: Pick<Book, "id" | "filePath" | "title">) => removeBook(book),
		onSuccess: (_data, book) => {
			qc.removeQueries({ queryKey: bookKeys.detail(book.id) });
			qc.removeQueries({ queryKey: bookKeys.content(book.id) });
			qc.invalidateQueries({ queryKey: bookKeys.all });
			qc.invalidateQueries({ queryKey: bookKeys.covers });
			qc.invalidateQueries({ queryKey: statsKeys.all });
			scheduleSyncPush();
			toast.success(`Removed "${book.title}"`);
		},
		onError: () => toast.error("Failed to remove book"),
	});
}

// ─── Exported object ─────────────────────────────────────────────────────────

export const bookHooks = {
	useBooks,
	useBook,
	useBookContent,
	useBookWordIndex,
	useImportBook,
	useImportBookFromClipboard,
	useImportBookFromUrl,
	useImportSerialFromUrl,
	useImportBookFromText,
	useImportBookFromBlob,
	useUpdateBook,
	useDeleteBook,
};
