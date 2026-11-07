import { bookStatus } from "@lesefluss/core";
import type { MembershipOrder } from "../../services/db/queries/collections";
import type { Book, CollectionBook } from "../../services/db/schema";

export type OrderedRow = {
	book: Book;
	seriesIndex: number | null;
	position: number | null;
};

/** Members in the order the query gives them (#N, then position, then title),
 *  without the ones whose book is not loaded. */
export function orderedRows(
	members: readonly CollectionBook[],
	booksById: ReadonlyMap<string, Book>,
): OrderedRow[] {
	const rows: OrderedRow[] = [];
	for (const m of members) {
		const book = booksById.get(m.bookId);
		if (book) rows.push({ book, seriesIndex: m.seriesIndex, position: m.position });
	}
	return rows;
}

/** `ids` with the one at `from` moved so it ends up at index `to`. */
export function moveItem<T>(ids: readonly T[], from: number, to: number): T[] {
	const next = [...ids];
	const [moved] = next.splice(from, 1);
	if (moved === undefined) return next;
	next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
	return next;
}

/**
 * Where a row dragged from `from` lands when dropped on row `over`, before or
 * after it. The result is the moved row's final index.
 */
export function dropIndex(from: number, over: number, after: boolean): number {
	const slot = after ? over + 1 : over;
	return slot > from ? slot - 1 : slot;
}

/** The writes that number `rows`, in this order, 1..N: only the rows whose #N changes. */
export function renumber(rows: readonly OrderedRow[]): MembershipOrder[] {
	const writes: MembershipOrder[] = [];
	rows.forEach((row, i) => {
		if (row.seriesIndex !== i + 1) {
			writes.push({ bookId: row.book.id, seriesIndex: i + 1, position: row.position });
		}
	});
	return writes;
}

export type OrderedSummary = { total: number; finished: number; reading: number };

export function orderedSummary(rows: readonly OrderedRow[]): OrderedSummary {
	let finished = 0;
	let reading = 0;
	for (const { book } of rows) {
		const status = bookStatus(book);
		if (status === "finished") finished++;
		else if (status === "reading") reading++;
	}
	return { total: rows.length, finished, reading };
}

export function summaryLabel({ total, finished, reading }: OrderedSummary): string {
	const parts = [`${total} ${total === 1 ? "book" : "books"}`];
	if (finished > 0) parts.push(`${finished} finished`);
	if (reading > 0) parts.push(`${reading} reading`);
	return parts.join(" · ");
}
