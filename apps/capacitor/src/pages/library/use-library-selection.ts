import { useCallback, useMemo, useState } from "react";
import { toast } from "../../components/toast";
import { useBackHandler } from "../../hooks/use-back-handler";
import { queryHooks } from "../../services/db/hooks";
import type { BulkAction } from "../../services/db/hooks/use-bulk-books";
import type { Book } from "../../services/db/schema";
import { type BulkSummary, bulkSummary } from "./bulk-summary";
import {
	deselectAllVisible,
	isAllVisibleSelected,
	type Selection,
	selectAllVisible,
	selectedBooks,
	toggleSelected,
} from "./selection";
import type { LibraryItem } from "./sort-filter";

/** Which bulk overlay is open, if any. Only one can be at a time. */
export type BulkSheet = null | "actions" | "status" | "tags";

export type UseLibrarySelection = {
	isSelecting: boolean;
	/** The selected books that still exist, in library order. */
	picked: Book[];
	isSelected: (bookId: string) => boolean;
	allVisibleSelected: boolean;
	begin: (bookId: string) => void;
	exit: () => void;
	toggle: (bookId: string) => void;
	toggleAllVisible: () => void;
	sheet: BulkSheet;
	openSheet: (sheet: Exclude<BulkSheet, null>) => void;
	closeSheet: () => void;
	isDeleteOpen: boolean;
	setDeleteOpen: (open: boolean) => void;
	failure: BulkSummary | null;
	dismissFailure: () => void;
	run: (action: BulkAction) => Promise<void>;
	isRunning: boolean;
	progress: { done: number; total: number; current: string };
};

/**
 * The library's selection mode: what is picked, which overlay is open, and what
 * happens when a bulk action finishes.
 *
 * Lives beside the page rather than in it, the same way `useLibraryImports`
 * holds every import mutation so the page can stay about rendering.
 */
export function useLibrarySelection(
	books: Book[],
	visibleItems: LibraryItem[],
): UseLibrarySelection {
	// null means not selecting. A set, possibly empty, means selection mode is on,
	// so "mode on with no set" cannot be represented.
	const [selection, setSelection] = useState<Selection | null>(null);
	const [sheet, setSheet] = useState<BulkSheet>(null);
	const [isDeleteOpen, setDeleteOpen] = useState(false);
	const [failure, setFailure] = useState<BulkSummary | null>(null);
	const bulk = queryHooks.useBulkBookActions();

	const isSelecting = selection !== null;

	// Counted through the books that still exist, so an id left behind by a book
	// a sync pull deleted needs no cleanup of its own.
	const picked = useMemo(
		() => (selection ? selectedBooks(selection, books) : []),
		[selection, books],
	);

	const exit = useCallback(() => {
		setSelection(null);
		setSheet(null);
		setDeleteOpen(false);
	}, []);

	// Registered before the overlay handler, so the sheet closes first. Stays
	// registered during a run and swallows the press: letting back through would
	// navigate away, unmounting the page mid-delete so the failure summary lands
	// on a dead component and the reader is told nothing.
	useBackHandler(isSelecting, () => {
		if (bulk.isRunning) return;
		exit();
	});
	useBackHandler(sheet !== null, () => setSheet(null));
	// Its own level, or back would fall through to the selection handler and wipe
	// a selection the reader spent several filters building.
	useBackHandler(isDeleteOpen, () => setDeleteOpen(false));

	const run = useCallback(
		async (action: BulkAction) => {
			setSheet(null);
			setDeleteOpen(false);
			const outcome = await bulk.run(action, picked);
			const summary = bulkSummary(outcome);
			// The headline always goes through the toast, which is module-level and
			// survives this page unmounting: leaving for another tab mid-run would
			// otherwise swallow the outcome entirely. The dialog adds the detail.
			if (summary.hasFailures) {
				toast.error(summary.headline);
				setFailure(summary);
			} else {
				toast.success(summary.headline);
			}
			exit();
		},
		[bulk, picked, exit],
	);

	return {
		isSelecting,
		picked,
		isSelected: useCallback((bookId) => selection?.has(bookId) ?? false, [selection]),
		allVisibleSelected: isAllVisibleSelected(selection ?? new Set(), visibleItems),
		begin: useCallback((bookId) => setSelection(new Set([bookId])), []),
		exit,
		toggle: useCallback(
			(bookId) => setSelection((current) => toggleSelected(current ?? new Set(), bookId)),
			[],
		),
		toggleAllVisible: useCallback(
			() =>
				setSelection((current) =>
					isAllVisibleSelected(current ?? new Set(), visibleItems)
						? deselectAllVisible(current ?? new Set(), visibleItems)
						: selectAllVisible(current ?? new Set(), visibleItems),
				),
			[visibleItems],
		),
		sheet,
		openSheet: useCallback((next) => setSheet(next), []),
		closeSheet: useCallback(() => setSheet(null), []),
		isDeleteOpen,
		setDeleteOpen,
		failure,
		dismissFailure: useCallback(() => setFailure(null), []),
		run,
		isRunning: bulk.isRunning,
		progress: bulk.progress,
	};
}
