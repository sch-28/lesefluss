import { wordPos } from "@lesefluss/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifySessionsDeleted } from "../deleted";
import { MIN_DURATION_MS, type SessionRow } from "../rules";
import {
	CLOSE_SETTLE_MS,
	closeVisit,
	dismissSummary,
	HOLD_MAX_MS,
	holdSummaryUntil,
	openVisit,
	recordSitting,
	resetSummaryStore,
	SUMMARY_MIN_ACTIVE_MS,
	SUMMARY_SETTING_HINT,
	useSessionSummary,
} from "../summary-store";

vi.mock("react", async (original) => ({
	...(await original<typeof import("react")>()),
	useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
}));

const MIN = 60_000;

function row(overrides: Partial<SessionRow> = {}): SessionRow {
	return {
		id: "s1",
		bookId: "b1",
		mode: "scroll",
		startedAt: 1000,
		endedAt: 1000 + 3 * MIN,
		durationMs: 3 * MIN,
		wordsRead: 750,
		startWord: wordPos(0),
		endWord: wordPos(750),
		furthestWord: wordPos(750),
		wpmAvg: 250,
		updatedAt: 1000,
		fontSize: null,
		segmentWpm: null,
		...overrides,
	};
}

const current = () => useSessionSummary();

async function leave() {
	closeVisit();
	await vi.advanceTimersByTimeAsync(CLOSE_SETTLE_MS);
}

beforeEach(() => {
	vi.useFakeTimers();
	resetSummaryStore();
});
afterEach(() => {
	vi.useRealTimers();
});

describe("summary store", () => {
	it("publishes a visit of 1 minute or more when the reader closes", async () => {
		openVisit();
		recordSitting(row());
		closeVisit();
		expect(current()).toBeNull();
		await vi.advanceTimersByTimeAsync(CLOSE_SETTLE_MS);
		expect(current()).toMatchObject({ bookId: "b1", sittings: [{ id: "s1" }] });
	});

	it("shows the summary from the same 1 minute a sitting needs to be written", async () => {
		expect(SUMMARY_MIN_ACTIVE_MS).toBe(MIN_DURATION_MS);
		openVisit();
		recordSitting(row({ durationMs: MIN }));
		await leave();
		expect(current()).toMatchObject({ bookId: "b1" });
	});

	it("publishes nothing under 1 minute", async () => {
		openVisit();
		recordSitting(row({ durationMs: SUMMARY_MIN_ACTIVE_MS - 1 }));
		await leave();
		expect(current()).toBeNull();
	});

	it("counts a sitting written twice once", async () => {
		openVisit();
		recordSitting(row({ durationMs: 30_000 }));
		recordSitting(row({ durationMs: 45_000 }));
		await leave();
		expect(current()).toBeNull();
	});

	it("merges the modes read in one visit", async () => {
		openVisit();
		recordSitting(row({ durationMs: MIN }));
		recordSitting(row({ id: "s2", mode: "rsvp", startedAt: 5000, durationMs: MIN }));
		await leave();
		expect(current()?.sittings.map((s) => s.mode)).toEqual(["scroll", "rsvp"]);
	});

	it("keeps the visit when the reader re-mounts while closing", async () => {
		openVisit();
		recordSitting(row({ durationMs: 30_000 }));
		closeVisit();
		openVisit();
		await vi.advanceTimersByTimeAsync(CLOSE_SETTLE_MS);
		expect(current()).toBeNull();
		recordSitting(row({ id: "s2", durationMs: 30_000 }));
		await leave();
		expect(current()?.sittings).toHaveLength(2);
	});

	it("waits for the sitting's last writes, so its figures read them", async () => {
		let commit = () => {};
		holdSummaryUntil(new Promise<void>((resolve) => (commit = resolve)));
		openVisit();
		recordSitting(row());
		await leave();
		expect(current()).toBeNull();
		commit();
		await vi.runAllTimersAsync();
		expect(current()).toMatchObject({ bookId: "b1" });
	});

	it("publishes after a failed write too", async () => {
		holdSummaryUntil(Promise.reject(new Error("disk full")));
		openVisit();
		recordSitting(row());
		await leave();
		expect(current()).toMatchObject({ bookId: "b1" });
	});

	it("stops waiting for a write that never settles", async () => {
		holdSummaryUntil(new Promise(() => {}));
		openVisit();
		recordSitting(row());
		await leave();
		expect(current()).toBeNull();
		await vi.advanceTimersByTimeAsync(HOLD_MAX_MS);
		expect(current()).toMatchObject({ bookId: "b1" });
	});

	it("publishes only for the latest close, once its own writes settle", async () => {
		let commitFirst = () => {};
		holdSummaryUntil(new Promise<void>((resolve) => (commitFirst = resolve)));
		openVisit();
		recordSitting(row());
		await leave();
		openVisit();
		let commitSecond = () => {};
		holdSummaryUntil(new Promise<void>((resolve) => (commitSecond = resolve)));
		await leave();

		commitFirst();
		await vi.advanceTimersByTimeAsync(0);
		expect(current()).toBeNull();

		commitSecond();
		await vi.advanceTimersByTimeAsync(0);
		expect(current()).toMatchObject({ bookId: "b1" });
		dismissSummary();
		await vi.runAllTimersAsync();
		expect(current()).toBeNull();
	});

	it("keeps the visit when the reader re-mounts while its writes settle", async () => {
		let commit = () => {};
		holdSummaryUntil(new Promise<void>((resolve) => (commit = resolve)));
		openVisit();
		recordSitting(row({ durationMs: 30_000 }));
		await leave();
		openVisit();
		commit();
		await vi.runAllTimersAsync();
		expect(current()).toBeNull();
		recordSitting(row({ id: "s2", durationMs: 30_000 }));
		await leave();
		expect(current()?.sittings).toHaveLength(2);
	});

	it("summarises only the last book of a visit", async () => {
		openVisit();
		recordSitting(row());
		recordSitting(row({ id: "s2", bookId: "b2" }));
		await leave();
		expect(current()).toMatchObject({ bookId: "b2", sittings: [{ id: "s2" }] });
	});

	it("lets a dismissed summary go", async () => {
		openVisit();
		recordSitting(row());
		await leave();
		dismissSummary();
		expect(current()).toBeNull();
	});

	it("drops a deleted sitting", async () => {
		openVisit();
		recordSitting(row());
		await leave();
		notifySessionsDeleted(["s1"]);
		expect(current()).toBeNull();
	});
});

describe("SUMMARY_SETTING_HINT", () => {
	it("names the same bar the summary opens at", () => {
		expect(SUMMARY_MIN_ACTIVE_MS).toBe(60_000);
		expect(SUMMARY_SETTING_HINT).toContain("after a minute or more");
	});
});
