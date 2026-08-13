import { type SyncReadingSession, wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { Book, ReadingSession } from "../../db/schema";
import {
	booksNeedingContent,
	clipSessionsForPush,
	nextSessionWatermark,
	partitionPushableSessions,
} from "../index";

function makeBook(overrides: Partial<Book> = {}): Book {
	return {
		id: "deadbeef",
		title: "T",
		author: null,
		fileFormat: "txt",
		filePath: null,
		size: 0,
		wordPosition: wordPos(0),
		wordCount: 0,
		isActive: false,
		addedAt: 0,
		lastRead: null,
		finishedAt: null,
		source: null,
		catalogId: null,
		sourceUrl: null,
		deleted: false,
		seriesId: null,
		chapterIndex: null,
		chapterSourceUrl: null,
		chapterStatus: "fetched",
		chapterError: null,
		description: null,
		language: null,
		status: null,
		rating: null,
		review: null,
		tags: null,
		updatedAt: 0,
		metadataUpdatedAt: 0,
		...overrides,
	};
}

function makeSession(overrides: Partial<ReadingSession> = {}): ReadingSession {
	return {
		id: "s1",
		bookId: "deadbeef",
		mode: "scroll",
		startedAt: 0,
		endedAt: 0,
		durationMs: 0,
		wordsRead: 0,
		startWord: wordPos(0),
		endWord: wordPos(0),
		wpmAvg: null,
		updatedAt: 0,
		...overrides,
	};
}

function makeSyncSession(overrides: Partial<SyncReadingSession> = {}): SyncReadingSession {
	return {
		sessionId: "s1",
		bookId: "deadbeef",
		mode: "scroll",
		startedAt: 1_000,
		endedAt: 2_000,
		durationMs: 1_000,
		wordsRead: 10,
		startWord: 0,
		endWord: 10,
		wpmAvg: 100,
		updatedAt: 2_000,
		...overrides,
	};
}

describe("partitionPushableSessions", () => {
	it("passes valid rows through", () => {
		const rows = [makeSyncSession(), makeSyncSession({ sessionId: "s2" })];
		const { pushable, rejected } = partitionPushableSessions(rows);
		expect(pushable).toHaveLength(2);
		expect(rejected).toHaveLength(0);
	});

	it("isolates a malformed row instead of failing the batch", () => {
		const rows = [
			makeSyncSession({ sessionId: "good1" }),
			makeSyncSession({ sessionId: "bad", startedAt: 5_000, endedAt: 1_000 }),
			makeSyncSession({ sessionId: "good2" }),
		];
		const { pushable, rejected } = partitionPushableSessions(rows);
		expect(pushable.map((s) => s.sessionId)).toEqual(["good1", "good2"]);
		expect(rejected.map((s) => s.sessionId)).toEqual(["bad"]);
	});
});

describe("booksNeedingContent", () => {
	it("skips books the server already stores content for", () => {
		const books = [makeBook({ id: "a" }), makeBook({ id: "b" })];
		expect(booksNeedingContent(books, new Set(["a"]))).toEqual(new Set(["b"]));
	});

	it("returns every standalone book when the server has nothing", () => {
		const books = [makeBook({ id: "a" }), makeBook({ id: "b" })];
		expect(booksNeedingContent(books, new Set())).toEqual(new Set(["a", "b"]));
	});

	it("skips tombstones and chapter rows, which never carry content", () => {
		const books = [
			makeBook({ id: "gone", deleted: true }),
			makeBook({ id: "chapter", seriesId: "series1" }),
			makeBook({ id: "real" }),
		];
		expect(booksNeedingContent(books, new Set())).toEqual(new Set(["real"]));
	});
});

describe("clipSessionsForPush", () => {
	it("passes rows through untouched below the cap", () => {
		const rows = [makeSession({ id: "a" }), makeSession({ id: "b" })];
		expect(clipSessionsForPush(rows, 10)).toBe(rows);
	});

	it("keeps the oldest rows by updatedAt when over the cap", () => {
		const rows = [
			makeSession({ id: "old", updatedAt: 1 }),
			makeSession({ id: "new", updatedAt: 3 }),
			makeSession({ id: "mid", updatedAt: 2 }),
		];
		expect(clipSessionsForPush(rows, 2).map((r) => r.id)).toEqual(["old", "mid"]);
	});

	it("leaves clipped rows above the resulting watermark so they still go next time", () => {
		const rows = [
			makeSession({ id: "a", updatedAt: 10 }),
			makeSession({ id: "b", updatedAt: 20 }),
			makeSession({ id: "c", updatedAt: 30 }),
		];
		const sent = clipSessionsForPush(rows, 2);
		const watermark = nextSessionWatermark(sent, 0, 1_000);
		const remaining = rows.filter((r) => r.updatedAt >= watermark);
		expect(remaining.map((r) => r.id)).toContain("c");
	});

	it("does not mutate the input while clipping", () => {
		const rows = [
			makeSession({ id: "old", updatedAt: 1 }),
			makeSession({ id: "new", updatedAt: 3 }),
		];
		clipSessionsForPush(rows, 1);
		expect(rows.map((r) => r.id)).toEqual(["old", "new"]);
	});
});

describe("nextSessionWatermark", () => {
	it("advances to the highest updatedAt in the batch", () => {
		const rows = [makeSession({ updatedAt: 50 }), makeSession({ updatedAt: 90 })];
		expect(nextSessionWatermark(rows, 10, 1_000)).toBe(90);
	});

	it("never advances past this device's clock", () => {
		// A session pulled from a peer whose clock runs a day fast. Adopting its
		// timestamp would sort every session recorded here below the watermark, so
		// none of them would ever be uploaded again.
		const fromFastPeer = [makeSession({ updatedAt: 1_000 + 86_400_000 })];
		expect(nextSessionWatermark(fromFastPeer, 10, 1_000)).toBe(1_000);
	});

	it("keeps a watermark already ahead of the clock rather than rewinding it", () => {
		expect(nextSessionWatermark([], 5_000, 1_000)).toBe(5_000);
	});

	it("never moves backwards", () => {
		expect(nextSessionWatermark([makeSession({ updatedAt: 5 })], 100)).toBe(100);
	});

	it("holds steady on an empty batch", () => {
		expect(nextSessionWatermark([], 100)).toBe(100);
	});
});
