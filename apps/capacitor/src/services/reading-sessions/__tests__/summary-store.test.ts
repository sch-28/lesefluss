import { wordPos } from "@lesefluss/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifySessionsDeleted } from "../deleted";
import { MIN_DURATION_MS, type SessionRow } from "../rules";
import {
	CLOSE_SETTLE_MS,
	closeVisit,
	dismissSummary,
	openVisit,
	recordSitting,
	resetSummaryStore,
	SUMMARY_MIN_ACTIVE_MS,
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

function leave() {
	closeVisit();
	vi.advanceTimersByTime(CLOSE_SETTLE_MS);
}

beforeEach(() => {
	vi.useFakeTimers();
	resetSummaryStore();
});
afterEach(() => {
	vi.useRealTimers();
});

describe("summary store", () => {
	it("publishes a visit of 1 minute or more when the reader closes", () => {
		openVisit();
		recordSitting(row());
		closeVisit();
		expect(current()).toBeNull();
		vi.advanceTimersByTime(CLOSE_SETTLE_MS);
		expect(current()).toMatchObject({ bookId: "b1", sittings: [{ id: "s1" }] });
	});

	it("shows the summary from the same 1 minute a sitting needs to be written", () => {
		expect(SUMMARY_MIN_ACTIVE_MS).toBe(MIN_DURATION_MS);
		openVisit();
		recordSitting(row({ durationMs: MIN }));
		leave();
		expect(current()).toMatchObject({ bookId: "b1" });
	});

	it("publishes nothing under 1 minute", () => {
		openVisit();
		recordSitting(row({ durationMs: SUMMARY_MIN_ACTIVE_MS - 1 }));
		leave();
		expect(current()).toBeNull();
	});

	it("counts a sitting written twice once", () => {
		openVisit();
		recordSitting(row({ durationMs: 30_000 }));
		recordSitting(row({ durationMs: 45_000 }));
		leave();
		expect(current()).toBeNull();
	});

	it("merges the modes read in one visit", () => {
		openVisit();
		recordSitting(row({ durationMs: MIN }));
		recordSitting(row({ id: "s2", mode: "rsvp", startedAt: 5000, durationMs: MIN }));
		leave();
		expect(current()?.sittings.map((s) => s.mode)).toEqual(["scroll", "rsvp"]);
	});

	it("keeps the visit when the reader re-mounts while closing", () => {
		openVisit();
		recordSitting(row({ durationMs: 30_000 }));
		closeVisit();
		openVisit();
		vi.advanceTimersByTime(CLOSE_SETTLE_MS);
		expect(current()).toBeNull();
		recordSitting(row({ id: "s2", durationMs: 30_000 }));
		leave();
		expect(current()?.sittings).toHaveLength(2);
	});

	it("summarises only the last book of a visit", () => {
		openVisit();
		recordSitting(row());
		recordSitting(row({ id: "s2", bookId: "b2" }));
		leave();
		expect(current()).toMatchObject({ bookId: "b2", sittings: [{ id: "s2" }] });
	});

	it("lets a dismissed summary go", () => {
		openVisit();
		recordSitting(row());
		leave();
		dismissSummary();
		expect(current()).toBeNull();
	});

	it("drops a deleted sitting", () => {
		openVisit();
		recordSitting(row());
		leave();
		notifySessionsDeleted(["s1"]);
		expect(current()).toBeNull();
	});
});
