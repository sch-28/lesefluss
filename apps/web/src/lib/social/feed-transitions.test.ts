import { describe, expect, test } from "vitest";
import { type FeedBookState, feedTransitions } from "./feed-transitions";

const NOW = new Date("2026-09-27T12:00:00Z");
const HOUR = 3_600_000;

function book(patch: Partial<FeedBookState> = {}): FeedBookState {
	return {
		bookId: "b1",
		status: null,
		wordPosition: 0,
		wordCount: 1000,
		finishedAt: null,
		deleted: false,
		seriesId: null,
		source: null,
		...patch,
	};
}

function run(before: FeedBookState | null, after: FeedBookState) {
	const map = new Map(before ? [[before.bookId, before]] : []);
	return feedTransitions(map, [after], NOW).map((t) => t.type);
}

describe("feedTransitions", () => {
	test("starting a book emits started", () => {
		expect(run(book(), book({ wordPosition: 50 }))).toEqual(["started"]);
		expect(run(book(), book({ status: "reading" }))).toEqual(["started"]);
	});

	test("finishing emits finished, by progress, by status or by a new finish date", () => {
		const reading = book({ wordPosition: 300 });
		expect(run(reading, book({ wordPosition: 990 }))).toEqual(["finished"]);
		expect(run(reading, book({ wordPosition: 300, status: "finished" }))).toEqual(["finished"]);
		expect(
			run(
				book({ status: "finished" }),
				book({ status: "finished", finishedAt: new Date(NOW.getTime() - HOUR) }),
			),
		).toEqual(["finished"]);
	});

	test("a book read in one go from want to finished emits only finished", () => {
		expect(run(book(), book({ wordPosition: 1000 }))).toEqual(["finished"]);
	});

	test("a book the server has never seen emits nothing", () => {
		expect(run(null, book({ wordPosition: 1000 }))).toEqual([]);
		expect(run(null, book({ wordPosition: 50 }))).toEqual([]);
	});

	test("an old finish date reaching the server late is history, not news", () => {
		const old = new Date(NOW.getTime() - 73 * HOUR);
		expect(run(book({ wordPosition: 300 }), book({ wordPosition: 990, finishedAt: old }))).toEqual(
			[],
		);
		expect(
			run(book({ status: "finished" }), book({ status: "finished", finishedAt: old })),
		).toEqual([]);
		const recent = new Date(NOW.getTime() - 71 * HOUR);
		expect(
			run(book({ wordPosition: 300 }), book({ wordPosition: 990, finishedAt: recent })),
		).toEqual(["finished"]);
	});

	test("tombstones, web-serial chapters and articles never emit", () => {
		const before = book({ wordPosition: 300 });
		expect(run(before, book({ wordPosition: 990, deleted: true }))).toEqual([]);
		expect(run(before, book({ wordPosition: 990, seriesId: "s1" }))).toEqual([]);
		expect(run(before, book({ wordPosition: 990, source: "url" }))).toEqual([]);
	});

	test("rereading or resetting a finished book emits nothing new", () => {
		const done = book({ wordPosition: 1000, finishedAt: new Date(NOW.getTime() - 200 * HOUR) });
		expect(run(done, book({ wordPosition: 0, finishedAt: done.finishedAt }))).toEqual([]);
		expect(run(book({ wordPosition: 400 }), book({ wordPosition: 10 }))).toEqual([]);
	});
});
