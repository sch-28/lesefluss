/**
 * Which books are picked in the library's selection mode.
 *
 * A set of ids rather than a flag on each item: `visibleItems` is derived from
 * the query cache and rebuilt on every render, so a flag would be wiped by any
 * refetch, filter change, or unrelated re-render. Ids survive all three, which
 * is what lets a selection outlive a search.
 */

import type { Book } from "../../services/db/schema";
import type { LibraryItem } from "./sort-filter";

/** Book ids only. Series are not selectable. */
export type Selection = ReadonlySet<string>;

export function selectableIds(items: readonly LibraryItem[]): string[] {
	return items.filter((item) => item.kind === "book").map((item) => item.book.id);
}

export function toggleSelected(selection: Selection, id: string): Selection {
	const next = new Set(selection);
	if (!next.delete(id)) next.add(id);
	return next;
}

/**
 * Add every visible book, keeping anything picked under an earlier filter. The
 * reader chose selections that survive filtering, so this adds rather than
 * replaces.
 */
export function selectAllVisible(selection: Selection, items: readonly LibraryItem[]): Selection {
	return withAll(selection, selectableIds(items));
}

/** Drop every visible book, keeping any hidden ones still picked. */
export function deselectAllVisible(selection: Selection, items: readonly LibraryItem[]): Selection {
	const next = new Set(selection);
	for (const id of selectableIds(items)) next.delete(id);
	return next;
}

/** Drives the All / None label. False for an empty grid, so All stays on offer. */
export function isAllVisibleSelected(selection: Selection, items: readonly LibraryItem[]): boolean {
	const ids = selectableIds(items);
	return ids.length > 0 && ids.every((id) => selection.has(id));
}

/**
 * The selected books that still exist, in library order.
 *
 * Every count and every action reads the selection through here, so an id left
 * behind by a book a sync pull deleted simply drops out. That is the whole
 * staleness story: no pruning effect, nothing to keep in step.
 */
export function selectedBooks(selection: Selection, books: readonly Book[]): Book[] {
	return books.filter((book) => selection.has(book.id));
}

/**
 * The books from `fromId` to `toId` in the visible order, both ends included,
 * whichever comes first. The visible order, not the DOM's, so rows the
 * virtualized grid has not rendered still count. Null when either end is not
 * in the view, e.g. an anchor the current filter hides.
 */
export function rangeIds(
	items: readonly LibraryItem[],
	fromId: string,
	toId: string,
): string[] | null {
	const ids = selectableIds(items);
	const from = ids.indexOf(fromId);
	const to = ids.indexOf(toId);
	if (from < 0 || to < 0) return null;
	return ids.slice(Math.min(from, to), Math.max(from, to) + 1);
}

export function withAll(selection: Selection, ids: readonly string[]): Selection {
	const next = new Set(selection);
	for (const id of ids) next.add(id);
	return next;
}

/**
 * A drag-select from `startId` to the book now under the finger, on top of what
 * was picked before the drag: dragging back shrinks the run, earlier picks stay.
 */
export function dragSelection(
	base: Selection,
	items: readonly LibraryItem[],
	startId: string,
	currentId: string,
): Selection {
	return withAll(base, rangeIds(items, startId, currentId) ?? [startId]);
}
