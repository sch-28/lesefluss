import { describe, expect, it } from "vitest";
import type { ReadingSession } from "../../../../services/db/schema";
import { makeBook } from "../../../../test/book-fixture";
import {
	bookFilterOptions,
	dayLabel,
	deleteConfirmCopy,
	deletedToastText,
	filterSessions,
	groupByDay,
	takeSessions,
	totalsOf,
} from "../sessions-model";

const at = (d: number, h = 12) => new Date(2026, 10, d, h).getTime();
const NOW = at(7, 15);

function session(over: Partial<ReadingSession> & { id: string }): ReadingSession {
	return {
		bookId: "b1",
		mode: "scroll",
		startedAt: at(7),
		endedAt: at(7) + 600_000,
		durationMs: 600_000,
		wordsRead: 2_500,
		startWord: 0,
		endWord: 2_500,
		furthestWord: 2_500,
		wpmAvg: 250,
		updatedAt: at(7),
		...over,
	} as ReadingSession;
}

describe("filterSessions", () => {
	const rows = [
		session({ id: "a" }),
		session({ id: "b", bookId: "b2" }),
		session({ id: "c", mode: "rsvp" }),
	];

	it("narrows by book and mode, and leaves out rows waiting on an undo", () => {
		expect(filterSessions(rows, { mode: "all", hidden: new Set() }).map((r) => r.id)).toEqual([
			"a",
			"b",
			"c",
		]);
		expect(
			filterSessions(rows, { bookId: "b1", mode: "all", hidden: new Set() }).map((r) => r.id),
		).toEqual(["a", "c"]);
		expect(filterSessions(rows, { mode: "rsvp", hidden: new Set() }).map((r) => r.id)).toEqual([
			"c",
		]);
		expect(filterSessions(rows, { mode: "all", hidden: new Set(["a"]) }).map((r) => r.id)).toEqual([
			"b",
			"c",
		]);
	});

	it("hides sittings under a minute, which the recorder no longer keeps", () => {
		const short = [
			session({ id: "s", durationMs: 59_000 }),
			session({ id: "m", durationMs: 60_000 }),
		];
		expect(filterSessions(short, { mode: "all", hidden: new Set() }).map((r) => r.id)).toEqual([
			"m",
		]);
	});
});

describe("bookFilterOptions", () => {
	it("leads with All books, so the list is never empty, then the books by title", () => {
		const books = new Map([
			["b1", makeBook({ id: "b1", title: "Middlemarch" })],
			["b2", makeBook({ id: "b2", title: "Emma" })],
		]);
		const rows = [session({ id: "a" }), session({ id: "b", bookId: "b2" }), session({ id: "c" })];
		expect(bookFilterOptions(rows, books)).toEqual([
			{ value: "", label: "All books", count: 3 },
			{ value: "b2", label: "Emma", count: 1 },
			{ value: "b1", label: "Middlemarch", count: 2 },
		]);
		expect(bookFilterOptions([], books)).toEqual([{ value: "", label: "All books", count: 0 }]);
	});
});

describe("totalsOf", () => {
	it("sums time over every row and speed over the measured ones", () => {
		const totals = totalsOf([
			session({ id: "a", durationMs: 600_000, wordsRead: 2_400 }),
			session({ id: "b", mode: "listen", durationMs: 600_000, wordsRead: 9_000 }),
		]);
		expect(totals).toEqual({ count: 2, totalMs: 1_200_000, wpm: 240 });
	});

	it("has no speed without a measured sitting", () => {
		expect(totalsOf([]).wpm).toBeNull();
	});
});

describe("groupByDay", () => {
	it("groups newest first under Today, Yesterday and a date, with each day's time", () => {
		const days = groupByDay(
			[
				session({ id: "a", startedAt: at(7, 9), durationMs: 60_000 }),
				session({ id: "b", startedAt: at(7, 8), durationMs: 120_000 }),
				session({ id: "c", startedAt: at(6) }),
				session({ id: "d", startedAt: at(3) }),
			],
			NOW,
		);
		expect(days.map((d) => [d.label, d.totalMs, d.sessions.map((s) => s.id)])).toEqual([
			["Today", 180_000, ["a", "b"]],
			["Yesterday", 600_000, ["c"]],
			[dayLabel("2026-11-03", NOW), 600_000, ["d"]],
		]);
		expect(days[2]?.label).not.toMatch(/Today|Yesterday/);
		const firstPage = takeSessions(days, 3);
		expect(firstPage.map((d) => [d.totalMs, d.sessions.map((s) => s.id)])).toEqual([
			[180_000, ["a", "b"]],
			[600_000, ["c"]],
		]);
		expect(takeSessions(days, 1)[0]).toMatchObject({ totalMs: 180_000, sessions: [{ id: "a" }] });
	});
});

describe("delete copy", () => {
	it("counts the undo toast, with the streak note only when a day goes", () => {
		expect(deletedToastText(1, false)).toBe("1 session deleted");
		expect(deletedToastText(3, true)).toBe("3 sessions deleted · Streak may change");
	});

	it("names the book, the time removed and what stays", () => {
		const doomed = Array.from({ length: 23 }, (_, i) =>
			session({ id: `s${i}`, durationMs: ((11 * 60 + 20) * 60_000) / 23 }),
		);
		expect(deleteConfirmCopy(doomed, "Middlemarch", false)).toEqual({
			title: "Delete 23 sessions of Middlemarch?",
			description:
				"11h 20m of reading is removed here and on your other devices after sync. Middlemarch's speed, time and the totals on Overview recalculate.\nThe book, your position and highlights stay.",
			confirmLabel: "Delete 23",
		});
	});

	it("speaks of books when the sessions span several, and warns about the streak", () => {
		const doomed = [session({ id: "a" }), session({ id: "b", bookId: "b2" })];
		const copy = deleteConfirmCopy(doomed, null, true);
		expect(copy.title).toBe("Delete 2 sessions?");
		expect(copy.description).toContain(
			"Speed, time and the totals on Overview recalculate. Streak may change.",
		);
		expect(copy.description).toContain("The books, your positions and highlights stay.");
	});
});
