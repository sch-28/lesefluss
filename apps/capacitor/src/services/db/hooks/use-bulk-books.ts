/**
 * Library actions that apply to many books at once.
 *
 * Deliberately not a loop over `useUpdateBook` / `useDeleteBook`: those toast and
 * invalidate per book, so forty books would mean forty toasts and forty full
 * library-plus-cover refetches, re-rendering the very cards being worked on.
 * Here the per-book work runs through `runSequential` and the cache is
 * invalidated once at the end.
 *
 * `scheduleSyncPush` is exempt from that reasoning: it debounces on a single
 * module timer, so calling it once at the end is a tidiness choice rather than a
 * correctness one.
 */

import type { BookStatus } from "@lesefluss/core";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
	NO_PROGRESS,
	runSequential,
	type SequentialProgress,
} from "../../../services/batch/run-sequential";
import { removeBook } from "../../book-import";
import { scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
import type { Book } from "../schema";
import { bookKeys, glossaryKeys, statsKeys } from "./query-keys";

/**
 * What one book's tags should become. Declared here, beside the action that
 * consumes it, so the model in `pages/` depends on the service and not the
 * other way round.
 */
export type TagPatch =
	/** Already matches every intent, so it needs no write at all. */
	| { kind: "unchanged" }
	| { kind: "write"; tags: string | null }
	/** A tag would push this book past the length cap; it is left untouched. */
	| { kind: "overflow" };

export type BulkAction =
	| { kind: "delete" }
	| { kind: "status"; status: BookStatus | null }
	/** `patch` decides per book; see `pages/library/bulk-tags.ts`. */
	| { kind: "tags"; patch: (book: Book) => TagPatch };

export type BulkFailure = {
	/** Captured at call time; the row itself may be gone by the time this shows. */
	title: string;
	reason: string;
};

export type BulkOutcome = {
	kind: BulkAction["kind"];
	succeeded: number;
	failures: BulkFailure[];
};

/** Raised by the tags action for a book that cannot take another tag. */
export const TAGS_FULL = "TAGS_FULL";

export function describeBulkError(kind: BulkAction["kind"], err?: unknown): string {
	if (err instanceof Error && err.message === TAGS_FULL) return "Too many tags on this book";
	return kind === "delete" ? "Couldn't delete this book" : "Couldn't update this book";
}

/** The per-book work one action does. Exported for tests; the hook owns the
 *  sequencing and the cache invalidation around it. */
export function runFor(action: BulkAction): (book: Book) => Promise<unknown> {
	if (action.kind === "delete") {
		return (book) => removeBook({ id: book.id, filePath: book.filePath });
	}
	if (action.kind === "status") {
		return async (book) => {
			// Re-read rather than trust the snapshot the selection was built from: a
			// sync pull can land mid-run, and patching stale values would overwrite
			// what it just brought in — then re-stamp, so the remote edit loses.
			const fresh = (await queries.getBook(book.id)) ?? book;
			// A book already at this status is skipped entirely. Writing it would
			// stamp `metadataUpdatedAt`, and sync merges the whole reader-editable
			// group behind that one stamp, so a no-op restatus here would overwrite a
			// rating or review another device edited more recently.
			if (fresh.status === action.status) return;
			await queries.updateBook(book.id, { status: action.status });
		};
	}
	return async (book) => {
		const fresh = (await queries.getBook(book.id)) ?? book;
		const patch = action.patch(fresh);
		// Same reasoning as status: a book that already matches gets no write.
		if (patch.kind === "unchanged") return;
		if (patch.kind === "overflow") throw new Error(TAGS_FULL);
		await queries.updateBook(book.id, { tags: patch.tags });
	};
}

type UseBulkBookActions = {
	run: (action: BulkAction, books: Book[]) => Promise<BulkOutcome>;
	progress: SequentialProgress;
	isRunning: boolean;
};

function useBulkBookActions(): UseBulkBookActions {
	const qc = useQueryClient();
	const [progress, setProgress] = useState<SequentialProgress>(NO_PROGRESS);
	const [isRunning, setIsRunning] = useState(false);

	const run = useCallback(
		async (action: BulkAction, books: Book[]): Promise<BulkOutcome> => {
			setIsRunning(true);
			setProgress({ done: 0, total: books.length, current: "" });

			try {
				const result = await runSequential({
					items: books,
					run: runFor(action),
					label: (book) => book.title,
					describeError: (err) => describeBulkError(action.kind, err),
					onProgress: setProgress,
				});

				if (result.succeeded > 0) {
					if (action.kind === "delete") {
						// Evict rather than invalidate: a deleted book's cached content can
						// be megabytes, and nothing will ever read it again. Only the books
						// that actually went; a failed one still exists and would just have
						// to re-read its content.
						const failed = new Set(result.failures.map(({ item }) => item.id));
						for (const book of books) {
							if (failed.has(book.id)) continue;
							qc.removeQueries({ queryKey: bookKeys.detail(book.id) });
							qc.removeQueries({ queryKey: bookKeys.content(book.id) });
						}
						qc.invalidateQueries({ queryKey: bookKeys.all });
						qc.invalidateQueries({ queryKey: bookKeys.covers });
						qc.invalidateQueries({ queryKey: statsKeys.all });
						// Deleting a book also deletes its glossary entries, which live
						// under a key root `bookKeys.all` does not reach.
						qc.invalidateQueries({ queryKey: glossaryKeys.all });
					} else {
						// Metadata only: covers are untouched, and the stats shelves read
						// finishedAt and wordPosition rather than status.
						qc.invalidateQueries({ queryKey: bookKeys.all });
					}
					scheduleSyncPush();
				}

				return {
					kind: action.kind,
					succeeded: result.succeeded,
					failures: result.failures.map(({ item, reason }) => ({ title: item.title, reason })),
				};
			} finally {
				setIsRunning(false);
				setProgress(NO_PROGRESS);
			}
		},
		[qc],
	);

	return { run, progress, isRunning };
}

export const bulkBookHooks = { useBulkBookActions };
