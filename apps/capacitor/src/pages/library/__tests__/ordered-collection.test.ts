import { describe, expect, it } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import {
	dropIndex,
	moveItem,
	nextInSeries,
	type OrderedRow,
	orderedRows,
	orderedSummary,
	renumber,
	seriesAuthor,
	summaryLabel,
} from "../ordered-collection";

const row = (
	id: string,
	seriesIndex: number | null,
	position: number | null = null,
): OrderedRow => ({
	book: makeBook({ id, title: id }),
	seriesIndex,
	position,
	shownIndex: seriesIndex,
});

describe("ordered collection", () => {
	it("keeps the members' order and skips books that are not loaded", () => {
		const books = new Map([
			["a", makeBook({ id: "a" })],
			["c", makeBook({ id: "c" })],
		]);
		const members = ["c", "b", "a"].map((bookId) => ({
			collectionId: "s",
			bookId,
			seriesIndex: null,
			position: null,
			deleted: false,
			updatedAt: 0,
		}));
		expect(orderedRows(members, books).map((r) => r.book.id)).toEqual(["c", "a"]);
	});

	it("moves an item to its final index", () => {
		expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
		expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
		expect(moveItem(["a", "b"], 1, 9)).toEqual(["a", "b"]);
	});

	it("turns a drop before or after a row into the moved row's final index", () => {
		// a b c d: drag a onto the bottom half of c lands it after c.
		expect(dropIndex(0, 2, true)).toBe(2);
		expect(dropIndex(0, 2, false)).toBe(1);
		expect(dropIndex(3, 0, false)).toBe(0);
		expect(dropIndex(3, 1, true)).toBe(2);
		expect(dropIndex(1, 1, true)).toBe(1);
	});

	it("numbers 1..N in the shown order, writing only the rows whose #N changes", () => {
		const rows = [row("a", 1, 5), row("c", 2.5), row("b", 2), row("d", null)];
		expect(renumber(rows)).toEqual([
			{ bookId: "c", seriesIndex: 2, position: null },
			{ bookId: "b", seriesIndex: 3, position: null },
			{ bookId: "d", seriesIndex: 4, position: null },
		]);
		expect(renumber([row("a", 1), row("b", 2)])).toEqual([]);
	});

	it("summarises the books, finished and reading", () => {
		const rows: OrderedRow[] = [
			{ ...row("a", 1), book: makeBook({ id: "a", wordPosition: 1000 as never }) },
			{
				...row("b", 2),
				book: makeBook({ id: "b", wordPosition: 400 as never, firstSittingAt: 1 }),
			},
			row("c", 3),
		];
		expect(summaryLabel(orderedSummary(rows))).toBe("3 books · 1 finished · 1 reading");
		expect(summaryLabel(orderedSummary([row("x", 1)]))).toBe("1 book");
	});

	it("orders a series by each book's own number until the members are numbered", () => {
		const books = new Map([
			["c", makeBook({ id: "c", title: "A Hero of Ages", seriesIndex: 3 })],
			["a", makeBook({ id: "a", title: "Mistborn", seriesIndex: 1 })],
			["x", makeBook({ id: "x", title: "Unnumbered" })],
			["b", makeBook({ id: "b", title: "Well of Ascension", seriesIndex: 2 })],
		]);
		const members = ["c", "x", "a", "b"].map((bookId) => ({
			collectionId: "s",
			bookId,
			seriesIndex: null,
			position: null,
			deleted: false,
			updatedAt: 0,
		}));
		const rows = orderedRows(members, books, true);
		expect(rows.map((r) => [r.book.id, r.shownIndex])).toEqual([
			["a", 1],
			["b", 2],
			["c", 3],
			["x", null],
		]);
		expect(orderedRows(members, books).map((r) => r.book.id)).toEqual(["c", "x", "a", "b"]);
		expect(renumber(rows).map((w) => w.bookId)).toEqual(["a", "b", "c", "x"]);
	});

	it("says all finished once every book is", () => {
		const done = (id: string, i: number) => ({
			...row(id, i),
			book: makeBook({ id, finishedAt: 1 }),
		});
		expect(summaryLabel(orderedSummary([done("a", 1), done("b", 2)]))).toBe(
			"2 books · all finished",
		);
	});

	it("offers to continue the book under way, else to start the next, else to open #1", () => {
		const reading = {
			...row("b", 2),
			book: makeBook({ id: "b", wordPosition: 400 as never, firstSittingAt: 1 }),
		};
		const done = { ...row("a", 1), book: makeBook({ id: "a", finishedAt: 1 }) };
		expect(nextInSeries([done, reading, row("c", 3)])?.label).toBe("Continue #2");
		expect(nextInSeries([done, row("c", 3)])?.label).toBe("Start #3");
		expect(nextInSeries([done])?.label).toBe("Open #1");
		expect(nextInSeries([])).toBeNull();
	});

	it("names the author once when the books share one", () => {
		const by = (id: string, author: string | null) => ({
			...row(id, 1),
			book: makeBook({ id, author }),
		});
		expect(seriesAuthor([by("a", "Brandon Sanderson"), by("b", null)])).toBe("Brandon Sanderson");
		expect(seriesAuthor([by("a", "Ann"), by("b", "Bob")])).toBeNull();
	});
});
