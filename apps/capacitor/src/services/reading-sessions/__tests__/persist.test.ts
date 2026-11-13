import { wordPos } from "@lesefluss/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionRow } from "../rules";

const db = vi.hoisted(() => ({
	status: null as string | null,
	finishedAt: null as number | null,
	firstSittingAt: null as number | null,
	upsertReadingSession: vi.fn(async () => {}),
	updateBook: vi.fn(async () => {}),
	markFirstSitting: vi.fn(async () => {}),
}));

vi.mock("../../db/queries", () => ({
	queries: {
		upsertReadingSession: db.upsertReadingSession,
		getBook: async (id: string) => ({
			id,
			status: db.status,
			finishedAt: db.finishedAt,
			firstSittingAt: db.firstSittingAt,
		}),
		updateBook: db.updateBook,
		markFirstSitting: db.markFirstSitting,
	},
}));
vi.mock("../../query-client", () => ({ queryClient: { invalidateQueries: vi.fn() } }));
vi.mock("../../sync", () => ({ scheduleSyncPush: vi.fn() }));
const holdSummaryUntil = vi.hoisted(() => vi.fn());
vi.mock("../summary-store", () => ({ holdSummaryUntil }));

const { persistRow } = await import("../persist");

let nextId = 0;
const row = (startedAt = 0): SessionRow => ({
	id: `s${++nextId}`,
	bookId: "b1",
	mode: "scroll",
	startedAt,
	endedAt: 90_000,
	durationMs: 90_000,
	wordsRead: 300,
	startWord: wordPos(0),
	endWord: wordPos(300),
	furthestWord: wordPos(300),
	wpmAvg: 200,
	fontSize: 18,
	segmentWpm: null,
	updatedAt: 90_000,
});

async function persist(status: string | null, finishedAt: number | null = null): Promise<void> {
	db.status = status;
	db.finishedAt = finishedAt;
	persistRow(row(), "checkpoint");
	await vi.waitFor(() => expect(db.upsertReadingSession).toHaveBeenCalled());
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("persistRow and the book's status", () => {
	beforeEach(() => {
		db.upsertReadingSession.mockClear();
		db.updateBook.mockClear();
		db.markFirstSitting.mockClear();
		db.firstSittingAt = 1;
	});

	it("returns a book set to Want to read or Dropped to automatic on a real sitting", async () => {
		await persist("want");
		expect(db.updateBook).toHaveBeenCalledWith("b1", { status: null });
		db.updateBook.mockClear();
		await persist("dropped");
		expect(db.updateBook).toHaveBeenCalledWith("b1", { status: null });
	});

	it("sets Reading on a book once finished and set to Want to read for a reread", async () => {
		await persist("want", 1);
		expect(db.updateBook).toHaveBeenCalledWith("b1", { status: "reading" });
	});

	it("leaves a finished, reading or automatic book as it is", async () => {
		for (const status of ["finished", "reading", null]) await persist(status);
		expect(db.updateBook).not.toHaveBeenCalled();
	});
});

describe("persistRow and the first sitting", () => {
	beforeEach(() => {
		db.upsertReadingSession.mockClear();
		db.markFirstSitting.mockClear();
		db.status = null;
		db.finishedAt = null;
	});

	async function persistAt(startedAt: number): Promise<void> {
		persistRow(row(startedAt), "flush");
		await vi.waitFor(() => expect(db.upsertReadingSession).toHaveBeenCalled());
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	it("records the first real sitting on a book that has none", async () => {
		db.firstSittingAt = null;
		await persistAt(5_000);
		expect(db.markFirstSitting).toHaveBeenCalledWith("b1", 5_000);
	});

	it("keeps an earlier first sitting", async () => {
		db.firstSittingAt = 1_000;
		await persistAt(5_000);
		expect(db.markFirstSitting).not.toHaveBeenCalled();
	});
});

describe("persistRow and the session summary", () => {
	beforeEach(() => holdSummaryUntil.mockClear());

	it("holds the summary until a sitting's final write has landed", async () => {
		let land = () => {};
		db.upsertReadingSession.mockImplementationOnce(
			() => new Promise<void>((resolve) => (land = resolve)),
		);
		persistRow(row(), "flush");
		expect(holdSummaryUntil).toHaveBeenCalledTimes(1);
		const held = holdSummaryUntil.mock.calls[0]?.[0] as Promise<unknown>;
		let isLanded = false;
		void held.then(() => (isLanded = true));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(isLanded).toBe(false);
		land();
		await held;
		expect(isLanded).toBe(true);
	});

	it("holds the summary through the book's first-sitting mark too", async () => {
		db.firstSittingAt = null;
		let mark = () => {};
		db.markFirstSitting.mockImplementationOnce(
			() => new Promise<void>((resolve) => (mark = resolve)),
		);
		persistRow(row(), "flush");
		const held = holdSummaryUntil.mock.calls[0]?.[0] as Promise<unknown>;
		let isLanded = false;
		void held.then(() => (isLanded = true));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(db.markFirstSitting).toHaveBeenCalled();
		expect(isLanded).toBe(false);
		mark();
		await held;
		expect(isLanded).toBe(true);
	});

	it("holds nothing for a checkpoint", () => {
		persistRow(row(), "checkpoint");
		expect(holdSummaryUntil).not.toHaveBeenCalled();
	});
});
