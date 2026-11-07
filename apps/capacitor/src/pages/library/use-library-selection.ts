import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "../../components/toast";
import { useBackHandler } from "../../hooks/use-back-handler";
import { queryHooks } from "../../services/db/hooks";
import type { BulkAction } from "../../services/db/hooks/use-bulk-books";
import type { Book } from "../../services/db/schema";
import { type BulkSummary, bulkSummary } from "./bulk-summary";
import {
	deselectAllVisible,
	dragSelection,
	isAllVisibleSelected,
	rangeIds,
	type Selection,
	selectAllVisible,
	selectableIds,
	selectedBooks,
	toggleSelected,
	withAll,
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
	/** Books in the current view, rendered or not: the N of "Select all N". */
	visibleCount: number;
	begin: (bookId: string) => void;
	exit: () => void;
	/** Toggles one book, entering selection mode if needed, and makes it the range anchor. */
	toggle: (bookId: string) => void;
	/** Adds the run from the anchor to this book in the visible order. */
	selectRange: (bookId: string) => void;
	toggleAllVisible: () => void;
	/** A drag across covers: adds the run from `start` to the book under the finger. */
	drag: {
		isActive: boolean;
		start: (bookId: string) => void;
		over: (bookId: string) => void;
		end: () => void;
	};
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
	const anchorRef = useRef<string | null>(null);
	const [dragStart, setDragStart] = useState<string | null>(null);
	// What was picked before the drag began, so dragging back shrinks the run
	// without dropping books picked earlier.
	const dragBaseRef = useRef<Selection>(new Set());

	// Counted through the books that still exist, so an id left behind by a book
	// a sync pull deleted needs no cleanup of its own.
	const picked = useMemo(
		() => (selection ? selectedBooks(selection, books) : []),
		[selection, books],
	);

	const exit = useCallback(() => {
		anchorRef.current = null;
		setDragStart(null);
		setSelection(null);
		setSheet(null);
		setDeleteOpen(false);
	}, []);

	// Registered when selection starts, so its sheets (which register their own
	// back handling when they open) close first. Stays registered during a run
	// and swallows the press: letting back through would navigate away,
	// unmounting the page mid-delete so the failure summary lands on a dead
	// component and the reader is told nothing.
	useBackHandler(isSelecting, () => {
		if (bulk.isRunning) return;
		exit();
	});

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
		visibleCount: useMemo(() => selectableIds(visibleItems).length, [visibleItems]),
		begin: useCallback((bookId) => {
			anchorRef.current = bookId;
			setSelection(new Set([bookId]));
		}, []),
		exit,
		toggle: useCallback((bookId) => {
			anchorRef.current = bookId;
			setSelection((current) => toggleSelected(current ?? new Set(), bookId));
		}, []),
		selectRange: useCallback(
			(bookId) => {
				const anchor = anchorRef.current;
				const run = anchor ? rangeIds(visibleItems, anchor, bookId) : null;
				// No anchor in view (none yet, or the filter hides it): a single toggle.
				if (!run) {
					anchorRef.current = bookId;
					setSelection((current) => toggleSelected(current ?? new Set(), bookId));
					return;
				}
				setSelection((current) => withAll(current ?? new Set(), run));
			},
			[visibleItems],
		),
		drag: {
			isActive: dragStart !== null,
			start: useCallback(
				(bookId) => {
					const base = selection ?? new Set<string>();
					dragBaseRef.current = base;
					anchorRef.current = bookId;
					setDragStart(bookId);
					setSelection(withAll(base, [bookId]));
				},
				[selection],
			),
			over: useCallback(
				(bookId) => {
					if (!dragStart) return;
					setSelection(dragSelection(dragBaseRef.current, visibleItems, dragStart, bookId));
				},
				[dragStart, visibleItems],
			),
			end: useCallback(() => setDragStart(null), []),
		},
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
