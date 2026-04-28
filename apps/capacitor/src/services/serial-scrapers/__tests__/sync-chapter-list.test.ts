/**
 * Unit tests for `syncChapterList` in commit.ts.
 *
 * All DB calls and scheduleSyncPush are mocked — these tests exercise only the
 * diff logic, not SQLite.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (must be declared before imports) ───────────────────────────────────

vi.mock("../../sync", () => ({
	scheduleSyncPush: vi.fn(),
}));

vi.mock("../../db/queries", () => ({
	queries: {
		getSeries: vi.fn(),
		getSeriesChapters: vi.fn(),
		insertChapters: vi.fn(),
		updateChapterIndex: vi.fn(),
		updateSeries: vi.fn(),
	},
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { queries } from "../../db/queries";
import { scheduleSyncPush } from "../../sync";
import { syncChapterList } from "../commit";
import type { ChapterRef } from "../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRef(overrides: Partial<ChapterRef> = {}): ChapterRef {
	return {
		index: 0,
		title: "Chapter 1",
		sourceUrl: "https://example.com/ch/1",
		...overrides,
	};
}

function makeExistingBook(overrides: Record<string, unknown> = {}) {
	return {
		id: "aabbccdd",
		title: "Chapter 1",
		chapterIndex: 0,
		chapterSourceUrl: "https://example.com/ch/1",
		chapterStatus: "fetched",
		seriesId: "series1",
		...overrides,
	};
}

const SERIES = {
	id: "series1",
	author: "Author A",
	sourceUrl: "https://example.com/series/1",
	tocUrl: "https://example.com/series/1/chapters",
	provider: "ao3",
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(queries.getSeries).mockResolvedValue(SERIES as never);
	vi.mocked(queries.getSeriesChapters).mockResolvedValue([]);
	vi.mocked(queries.insertChapters).mockResolvedValue(undefined);
	vi.mocked(queries.updateChapterIndex).mockResolvedValue(undefined);
	vi.mocked(queries.updateSeries).mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("syncChapterList", () => {
	it("returns added:0 and skips insertChapters when all refs already exist", async () => {
		vi.mocked(queries.getSeriesChapters).mockResolvedValue([
			makeExistingBook() as never,
		]);

		const result = await syncChapterList("series1", [makeRef()]);

		expect(result).toEqual({ added: 0 });
		expect(queries.insertChapters).not.toHaveBeenCalled();
		expect(scheduleSyncPush).not.toHaveBeenCalled();
	});

	it("inserts new chapter rows when ref is not in existing set", async () => {
		// DB has chapter 0; upstream now has chapter 0 + a new chapter 1.
		vi.mocked(queries.getSeriesChapters).mockResolvedValue([
			makeExistingBook({ chapterIndex: 0, chapterSourceUrl: "https://example.com/ch/1" }) as never,
		]);

		const refs: ChapterRef[] = [
			makeRef({ index: 0, sourceUrl: "https://example.com/ch/1" }),
			makeRef({ index: 1, title: "Chapter 2", sourceUrl: "https://example.com/ch/2" }),
		];

		const result = await syncChapterList("series1", refs);

		expect(result).toEqual({ added: 1 });
		expect(queries.insertChapters).toHaveBeenCalledOnce();
		const inserted = vi.mocked(queries.insertChapters).mock.calls[0][0];
		expect(inserted).toHaveLength(1);
		expect(inserted[0].chapterSourceUrl).toBe("https://example.com/ch/2");
		expect(inserted[0].chapterStatus).toBe("pending");
		expect(inserted[0].seriesId).toBe("series1");
	});

	it("inserts multiple new chapters in one batch call", async () => {
		vi.mocked(queries.getSeriesChapters).mockResolvedValue([]);

		const refs: ChapterRef[] = [
			makeRef({ index: 0, sourceUrl: "https://example.com/ch/1" }),
			makeRef({ index: 1, sourceUrl: "https://example.com/ch/2" }),
			makeRef({ index: 2, sourceUrl: "https://example.com/ch/3" }),
		];

		const result = await syncChapterList("series1", refs);

		expect(result).toEqual({ added: 3 });
		expect(queries.insertChapters).toHaveBeenCalledOnce();
		expect(vi.mocked(queries.insertChapters).mock.calls[0][0]).toHaveLength(3);
	});

	it("calls updateChapterIndex for reordered chapters", async () => {
		// Chapter exists at index 5 but upstream says it's now at index 7.
		vi.mocked(queries.getSeriesChapters).mockResolvedValue([
			makeExistingBook({
				id: "ch0001",
				chapterIndex: 5,
				chapterSourceUrl: "https://example.com/ch/1",
			}) as never,
		]);

		await syncChapterList("series1", [
			makeRef({ index: 7, sourceUrl: "https://example.com/ch/1" }),
		]);

		expect(queries.updateChapterIndex).toHaveBeenCalledOnce();
		expect(queries.updateChapterIndex).toHaveBeenCalledWith("ch0001", 7);
	});

	it("does NOT call updateChapterIndex when index is unchanged", async () => {
		vi.mocked(queries.getSeriesChapters).mockResolvedValue([
			makeExistingBook({ id: "ch0001", chapterIndex: 0 }) as never,
		]);

		await syncChapterList("series1", [makeRef({ index: 0 })]);

		expect(queries.updateChapterIndex).not.toHaveBeenCalled();
	});

	it("always updates series.lastCheckedAt", async () => {
		const before = Date.now();
		await syncChapterList("series1", []);
		const after = Date.now();

		expect(queries.updateSeries).toHaveBeenCalledOnce();
		const [id, data] = vi.mocked(queries.updateSeries).mock.calls[0];
		expect(id).toBe("series1");
		expect(data.lastCheckedAt).toBeGreaterThanOrEqual(before);
		expect(data.lastCheckedAt).toBeLessThanOrEqual(after);
	});

	it("calls scheduleSyncPush only when new chapters were added", async () => {
		// No new chapters.
		vi.mocked(queries.getSeriesChapters).mockResolvedValue([
			makeExistingBook() as never,
		]);
		await syncChapterList("series1", [makeRef()]);
		expect(scheduleSyncPush).not.toHaveBeenCalled();

		// With new chapters.
		vi.mocked(queries.getSeriesChapters).mockResolvedValue([]);
		await syncChapterList("series1", [makeRef()]);
		expect(scheduleSyncPush).toHaveBeenCalledOnce();
	});

	it("preserves existing rows even when they're absent from upstream refs", async () => {
		// DB has 2 chapters; upstream only returns 1 (e.g. author un-published one).
		vi.mocked(queries.getSeriesChapters).mockResolvedValue([
			makeExistingBook({ chapterSourceUrl: "https://example.com/ch/1" }) as never,
			makeExistingBook({
				id: "bbccddee",
				chapterSourceUrl: "https://example.com/ch/2",
			}) as never,
		]);

		// Only chapter 1 comes back from upstream.
		const result = await syncChapterList("series1", [
			makeRef({ sourceUrl: "https://example.com/ch/1" }),
		]);

		// No deletions, no inserts — existing rows stay.
		expect(result).toEqual({ added: 0 });
		expect(queries.insertChapters).not.toHaveBeenCalled();
	});

	it("throws SERIES_MISSING when the series row is not found", async () => {
		vi.mocked(queries.getSeries).mockResolvedValue(undefined);

		await expect(syncChapterList("missing", [])).rejects.toThrow("SERIES_MISSING");
	});
});
