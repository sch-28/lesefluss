import { bookStatus, displayAuthor } from "@lesefluss/core";
import { formatSeriesNumber } from "../../components/collections/series-numbering";
import type { MembershipOrder } from "../../services/db/queries/collections";
import type { Book, CollectionBook } from "../../services/db/schema";

export type OrderedRow = {
	book: Book;
	/** The membership's own #N; a reorder writes it. */
	seriesIndex: number | null;
	position: number | null;
	/** The #N the row shows: the membership's, else the book's own series number. */
	shownIndex: number | null;
};

/**
 * Members in the order the query gives them (#N, then position, then title),
 * without the ones whose book is not loaded. In a series, a member without its
 * own #N takes the book's series number, so a series reads in series order even
 * before anyone numbered it.
 */
export function orderedRows(
	members: readonly CollectionBook[],
	booksById: ReadonlyMap<string, Book>,
	isSeries = false,
): OrderedRow[] {
	const rows: OrderedRow[] = [];
	for (const m of members) {
		const book = booksById.get(m.bookId);
		if (!book) continue;
		const shownIndex = m.seriesIndex ?? (isSeries ? book.seriesIndex : null);
		rows.push({ book, seriesIndex: m.seriesIndex, position: m.position, shownIndex });
	}
	if (!isSeries) return rows;
	const rank = (r: OrderedRow) => r.shownIndex ?? Number.POSITIVE_INFINITY;
	return rows
		.map((r, i) => ({ r, i }))
		.sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
		.map(({ r }) => r);
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

export function orderedSummary(rows: readonly Pick<OrderedRow, "book">[]): OrderedSummary {
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
	if (total > 1 && finished === total) parts.push("all finished");
	else if (finished > 0) parts.push(`${finished} finished`);
	if (reading > 0) parts.push(`${reading} reading`);
	return parts.join(" · ");
}

/** The series' author when every book that names one names the same. */
export function seriesAuthor(rows: readonly OrderedRow[]): string | null {
	const authors = new Set(
		rows.flatMap(({ book }) => (book.author ? [displayAuthor(book.author)] : [])),
	);
	return authors.size === 1 ? ([...authors][0] ?? null) : null;
}

/**
 * The series page's one action: go on with the book under way, else start the
 * first one not finished, else open #1 again.
 */
export function nextInSeries(
	rows: readonly OrderedRow[],
): { row: OrderedRow; label: string } | null {
	const numbered = (verb: string, row: OrderedRow, i: number) => ({
		row,
		label: `${verb} ${formatSeriesNumber(row.shownIndex ?? i + 1)}`,
	});
	const statuses = rows.map(({ book }) => bookStatus(book));
	const reading = statuses.indexOf("reading");
	if (reading >= 0) return numbered("Continue", rows[reading] as OrderedRow, reading);
	const unread = statuses.findIndex((s) => s !== "finished" && s !== "dropped");
	if (unread >= 0) return numbered("Start", rows[unread] as OrderedRow, unread);
	const first = rows[0];
	return first ? numbered("Open", first, 0) : null;
}
