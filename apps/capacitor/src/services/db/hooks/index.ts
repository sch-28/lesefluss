/**
 * `queryHooks` — react-query wrappers for all local DB operations.
 *
 * Same ergonomics as the `queries` object, but returns react-query
 * `UseQueryResult` / `UseMutationResult` instead of bare promises.
 *
 * Usage:
 *   import { queryHooks } from "../services/db/hooks";
 *
 *   // Reads
 *   const { data, isPending } = queryHooks.useBooks();
 *   const { data: book }      = queryHooks.useBook(id);
 *   const { data: content }   = queryHooks.useBookContent(id);
 *   const { data: settings }  = queryHooks.useSettings();
 *
 *   // Writes
 *   const importBook  = queryHooks.useImportBook();
 *   importBook.mutate({ onProgress: (pct) => setProgress(pct) });
 *
 *   const deleteBook  = queryHooks.useDeleteBook();
 *   deleteBook.mutate(book);
 *
 *   const saveSettings = queryHooks.useSaveSettings();
 *   saveSettings.mutate({ wpm: 400 });
 *
 * Query keys are re-exported for callers that need manual invalidation.
 */

import { bookHooks } from "./use-books";
import { settingsHooks } from "./use-settings";

export { bookKeys, settingsKeys } from "./query-keys";

export const queryHooks = {
	// ── Books ──────────────────────────────────────────────────────────────
	/** All books list + cover images map, fetched in parallel. */
	useBooks: bookHooks.useBooks,

	/** Single book metadata. */
	useBook: bookHooks.useBook,

	/** Single book content (large text, cover base64, chapters). */
	useBookContent: bookHooks.useBookContent,

	/** Mutation: import a book from the file picker. */
	useImportBook: bookHooks.useImportBook,

	/** Mutation: delete a book (disk + DB). */
	useDeleteBook: bookHooks.useDeleteBook,

	// ── Settings ───────────────────────────────────────────────────────────
	/** The single RSVP settings row. */
	useSettings: settingsHooks.useSettings,

	/** Mutation: persist a settings patch to SQLite. */
	useSaveSettings: settingsHooks.useSaveSettings,
};
