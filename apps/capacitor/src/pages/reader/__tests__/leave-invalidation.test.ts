import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookKeys, statsKeys } from "../../../services/db/hooks/query-keys";
import { isLeavingReader, refreshAfterLeaving } from "../leave-invalidation";

const holds = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock("../../../services/reading-sessions/summary-store", () => ({
	HOLD_MAX_MS: 1500,
	holdSummaryUntil: (write: Promise<unknown>) => holds.push(write),
}));

let now = 0;
const later = (ms: number) => {
	now += ms;
};

function seeded() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	for (const key of [
		bookKeys.all,
		bookKeys.detail("b1"),
		bookKeys.content("b1"),
		bookKeys.wordIndex("b1"),
		statsKeys.goalPlansOf("b1"),
	]) {
		qc.setQueryData(key, "cached");
	}
	return qc;
}

const isStale = (qc: QueryClient, key: readonly unknown[]) =>
	qc.getQueryCache().find({ queryKey: key, exact: true })?.state.isInvalidated;

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

function watchedBookList() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const queryFn = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve("books"), 10)));
	const stop = new QueryObserver(qc, { queryKey: bookKeys.all, queryFn }).subscribe(() => {});
	return { qc, queryFn, stop };
}

beforeEach(() => {
	later(10_000);
	vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
	holds.length = 0;
	vi.restoreAllMocks();
});

describe("refreshAfterLeaving", () => {
	it("refreshes the library and the book's row but keeps its text and word index", async () => {
		const qc = seeded();
		refreshAfterLeaving(qc, "b1", Promise.resolve(), { isSaving: true });
		await holds[0];

		expect(isStale(qc, bookKeys.all)).toBe(true);
		expect(isStale(qc, bookKeys.detail("b1"))).toBe(true);
		expect(isStale(qc, bookKeys.content("b1"))).toBe(false);
		expect(isStale(qc, bookKeys.wordIndex("b1"))).toBe(false);
	});

	it("refetches the library only once the position has committed", async () => {
		const { qc, queryFn, stop } = watchedBookList();
		await vi.waitFor(() => expect(qc.getQueryData(bookKeys.all)).toBe("books"));
		queryFn.mockClear();

		const commit = deferred();
		refreshAfterLeaving(qc, "b1", commit.promise, { isSaving: true });
		await Promise.resolve();
		expect(queryFn).not.toHaveBeenCalled();

		commit.resolve();
		await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
		stop();
	});

	it("skips the re-mount's leave without a save, but not a second leave that saves", async () => {
		const { qc, queryFn, stop } = watchedBookList();
		await vi.waitFor(() => expect(qc.getQueryData(bookKeys.all)).toBe("books"));
		queryFn.mockClear();

		refreshAfterLeaving(qc, "b1", Promise.resolve(), { isSaving: true });
		later(100);
		refreshAfterLeaving(qc, "b1", Promise.resolve(), { isSaving: false });
		await Promise.all(holds);
		await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));

		later(100);
		refreshAfterLeaving(qc, "b1", Promise.resolve(), { isSaving: true });
		await Promise.all(holds);
		await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
		stop();
	});

	it("refreshes the library on a leave without a save when no leave came just before", async () => {
		const qc = seeded();
		refreshAfterLeaving(qc, "b1", Promise.resolve(), { isSaving: false });
		await holds[0];
		await Promise.resolve();
		expect(isStale(qc, bookKeys.all)).toBe(true);
	});

	it("refreshes the goal plan only after the position commits, and holds the summary until then", async () => {
		const qc = seeded();
		const commit = deferred();
		refreshAfterLeaving(qc, "b1", commit.promise, { isSaving: true });

		expect(holds).toHaveLength(1);
		let held = true;
		void holds[0].then(() => {
			held = false;
		});
		await Promise.resolve();
		expect(isStale(qc, statsKeys.goalPlansOf("b1"))).toBe(false);
		expect(held).toBe(true);

		commit.resolve();
		await holds[0];
		expect(isStale(qc, statsKeys.goalPlansOf("b1"))).toBe(true);
		expect(held).toBe(false);
	});

	it("still refreshes the goal plan when the write fails", async () => {
		const qc = seeded();
		refreshAfterLeaving(qc, "b1", Promise.reject(new Error("db")), { isSaving: true });
		await holds[0];
		expect(isStale(qc, statsKeys.goalPlansOf("b1"))).toBe(true);
	});
});

describe("isLeavingReader", () => {
	it("holds for a second after leaving the reader", () => {
		expect(isLeavingReader()).toBe(false);
		refreshAfterLeaving(seeded(), "b1", Promise.resolve(), { isSaving: true });
		later(900);
		expect(isLeavingReader()).toBe(true);
		later(200);
		expect(isLeavingReader()).toBe(false);
	});
});
