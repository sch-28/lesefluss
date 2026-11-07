import { useMemo, useState } from "react";
import { useRegisterCommands } from "../../commands/registry";
import { type LibraryKeySheet, libraryKeyCommands } from "./commands";
import { type LibraryGroup, layoutRows } from "./group-by";
import { escapeStep, moveFocus, rowTokens } from "./library-focus";
import type { LibraryItem } from "./sort-filter";
import type { UseLibrarySelection } from "./use-library-selection";
import { useGridColumns } from "./virtual-book-grid";

type Input = {
	/** What the grid, list or table renders; null when none of them shows. */
	items: readonly LibraryItem[] | null;
	groups: readonly LibraryGroup[] | null;
	collapsed: ReadonlySet<string>;
	viewMode: "grid" | "list" | "table";
	selection: UseLibrarySelection;
	search: { canSearch: boolean; isActive: boolean; focus: () => void; clear: () => void };
	canGroup: boolean;
	openGroupBy: () => void;
	openItem: (item: LibraryItem) => void;
};

/**
 * The library's keyboard focus and its shortcuts. The focus is a highlighted
 * item, not DOM focus: the cards stay out of the tab order they have today.
 */
export function useLibraryKeyboard({
	items,
	groups,
	collapsed,
	viewMode,
	selection,
	search,
	canGroup,
	openGroupBy,
	openItem,
}: Input): { focusedKey: string | null } {
	const [focusedKey, setFocusedKey] = useState<string | null>(null);
	const gridCols = useGridColumns();
	const cols = viewMode === "grid" ? gridCols : 1;
	const { rows, itemByToken } = useMemo(() => {
		const layout = items ? layoutRows(items, groups, cols, collapsed) : [];
		const tokens = rowTokens(layout);
		const byToken = new Map<string, LibraryItem>();
		layout.forEach((row, index) => {
			if (row.type !== "items") return;
			row.items.forEach((item, column) => {
				const token = tokens[index]?.[column];
				if (token) byToken.set(token, item);
			});
		});
		return {
			rows: tokens.filter((row): row is string[] => row !== null),
			itemByToken: byToken,
		};
	}, [items, groups, cols, collapsed]);

	// A focus the view no longer shows (filtered out, collapsed, deleted) is no focus.
	const focused = focusedKey === null ? null : (itemByToken.get(focusedKey) ?? null);
	const focusedBook = focused?.kind === "book" ? focused.book : null;
	const hasTargets = selection.picked.length > 0 || focusedBook !== null;

	const step = escapeStep({
		isSearchActive: search.isActive,
		isSelecting: selection.isSelecting,
		hasFocus: focused !== null,
	});

	useRegisterCommands(
		libraryKeyCommands({
			canSearch: search.canSearch,
			hasItems: rows.length > 0,
			hasFocusedItem: focused !== null,
			hasFocusedBook: focusedBook !== null,
			hasTargets,
			isBusy: selection.isRunning,
			canGroup,
			// A bulk run acts on the selection; leaving it mid-run would hide its result.
			canEscape: step !== null && !(step === "selection" && selection.isRunning),
			focusSearch: search.focus,
			move: (move) => setFocusedKey(moveFocus(rows, focused ? focusedKey : null, move)),
			openFocused: () => {
				if (!focused) return;
				if (!selection.isSelecting) openItem(focused);
				else if (focusedBook && !selection.isRunning) selection.toggle(focusedBook.id);
			},
			toggleFocused: () => {
				if (focusedBook) selection.toggle(focusedBook.id);
			},
			escape: () => {
				if (step === "search") search.clear();
				else if (step === "selection") selection.exit();
				else if (step === "focus") setFocusedKey(null);
			},
			rate: (rating) => {
				void selection.run({ kind: "rating", rating }, focusedBook?.id);
			},
			openSheet: (sheet: LibraryKeySheet) => selection.openSheet(sheet, focusedBook?.id),
			openGroupBy,
		}),
	);

	return { focusedKey: focused ? focusedKey : null };
}
