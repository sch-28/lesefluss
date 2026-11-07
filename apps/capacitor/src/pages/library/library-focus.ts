import { type GridRow, itemKey } from "./group-by";
import type { LibraryItem } from "./sort-filter";

/** j/k and ←/→ step through the visible order; ↑/↓ move a row in the grid. */
export type FocusMove = "next" | "prev" | "up" | "down";

/**
 * What the keyboard focus points at: an item within its group, since grouping
 * by tag, collection or series shows one book in several groups.
 */
export function focusToken(groupKey: string | null, item: LibraryItem): string {
	return `${groupKey ?? ""}\u0000${itemKey(item)}`;
}

/** Each layout row's focus tokens, null for a group heading; aligned with `rows`. */
export function rowTokens(rows: readonly GridRow[]): (string[] | null)[] {
	let groupKey: string | null = null;
	return rows.map((row) => {
		if (row.type === "header") {
			groupKey = row.group.key;
			return null;
		}
		return row.items.map((item) => focusToken(groupKey, item));
	});
}

/** The focus tokens of each shown row, group headings and collapsed groups left out. */
export function focusRows(rows: readonly GridRow[]): string[][] {
	return rowTokens(rows).filter((row): row is string[] => row !== null);
}

/**
 * Where the keyboard focus goes. With nothing focused (or a focus the view no
 * longer shows) any move lands on the first item. At an edge it stays put;
 * ↑/↓ keep the column, or take a shorter row's last item.
 */
export function moveFocus(
	rows: readonly (readonly string[])[],
	current: string | null,
	move: FocusMove,
): string | null {
	const flat = rows.flat();
	const index = current === null ? -1 : flat.indexOf(current);
	if (index < 0) return flat[0] ?? null;
	if (move === "next") return flat[Math.min(index + 1, flat.length - 1)] ?? null;
	if (move === "prev") return flat[Math.max(index - 1, 0)] ?? null;

	const rowIndex = rows.findIndex((row) => row.includes(flat[index] as string));
	const row = rows[rowIndex] ?? [];
	const target = rows[move === "down" ? rowIndex + 1 : rowIndex - 1];
	if (!target || target.length === 0) return current;
	const column = row.indexOf(flat[index] as string);
	return target[Math.min(column, target.length - 1)] ?? null;
}

export type EscapeStep = "search" | "selection" | "focus";

/** The library's one Esc order: search, then selection, then focus, one per press. */
export function escapeStep(state: {
	isSearchActive: boolean;
	isSelecting: boolean;
	hasFocus: boolean;
}): EscapeStep | null {
	if (state.isSearchActive) return "search";
	if (state.isSelecting) return "selection";
	if (state.hasFocus) return "focus";
	return null;
}
