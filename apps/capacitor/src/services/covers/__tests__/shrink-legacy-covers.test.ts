// @vitest-environment node
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../../db/__tests__/test-db";
import type { DbDriverKind } from "../../db/driver";

const { db, raw, close } = createTestDb();
vi.mock("../../db/index", () => ({
	get db() {
		return db;
	},
	activeDriver: () => null,
}));
afterAll(close);

const normalizeCoverDataUrl = vi.hoisted(() => vi.fn(async (v: string | null) => v));
vi.mock("@lesefluss/book-import/utils/cover-image", async (importOriginal) => ({
	...(await importOriginal<typeof import("@lesefluss/book-import/utils/cover-image")>()),
	normalizeCoverDataUrl,
}));

const { getOversizedCovers, getStoredCover, replaceStoredCover } = await import(
	"../../db/queries/covers"
);
const { COVER_BUDGET_CHARS, normalizeIncomingCover, runCoverShrink, startCoverShrink } =
	await import("../shrink-legacy-covers");

const BIG = `data:image/jpeg;base64,${"A".repeat(COVER_BUDGET_CHARS * 3)}`;
const SMALL = "data:image/webp;base64,c21hbGw=";
const UNDECODABLE = `data:image/svg+xml;base64,${"B".repeat(COVER_BUDGET_CHARS * 2)}`;

function insertBook(id: string, cover: string | null) {
	raw
		.prepare(
			`INSERT INTO books (id, title, file_format, size, word_position, word_count, is_active, added_at, deleted, updated_at, metadata_updated_at)
			 VALUES (?, 'Book', 'epub', 1, 0, 10, 0, 500, 0, 1000, 1000)`,
		)
		.run(id);
	raw
		.prepare("INSERT INTO book_content (book_id, content, cover_image) VALUES (?, 'text', ?)")
		.run(id, cover);
}

function insertSeries(id: string, cover: string | null) {
	raw
		.prepare(
			`INSERT INTO series (id, title, cover_image, source_url, toc_url, provider, created_at, deleted, updated_at)
			 VALUES (?, 'Serial', ?, 'https://x', 'https://x', 'rss', 100, 0, 1000)`,
		)
		.run(id, cover);
}

function bookCover(id: string) {
	return (
		raw.prepare("SELECT cover_image FROM book_content WHERE book_id = ?").get(id) as {
			cover_image: string | null;
		}
	).cover_image;
}

function seriesCover(id: string) {
	return (
		raw.prepare("SELECT cover_image FROM series WHERE id = ?").get(id) as {
			cover_image: string | null;
		}
	).cover_image;
}

function stamps() {
	return {
		books: raw.prepare("SELECT id, updated_at, metadata_updated_at FROM books ORDER BY id").all(),
		series: raw.prepare("SELECT id, updated_at FROM series ORDER BY id").all(),
	};
}

function makeDeps(kind: DbDriverKind | null = "opfs") {
	let done = false;
	const deps = {
		storageKind: vi.fn(() => kind),
		isDone: vi.fn(async () => done),
		markDone: vi.fn(async () => {
			done = true;
		}),
		candidates: () => getOversizedCovers(COVER_BUDGET_CHARS),
		read: getStoredCover,
		replace: replaceStoredCover,
		shrink: vi.fn(async (cover: string) => (cover.startsWith("data:image/svg") ? cover : SMALL)),
		pause: vi.fn(async () => {}),
	};
	return { deps, isDone: () => done };
}

beforeEach(() => {
	raw.exec("DELETE FROM book_content; DELETE FROM books; DELETE FROM series;");
	normalizeCoverDataUrl.mockClear();
});

describe("runCoverShrink", () => {
	it("shrinks oversized book and series covers once, leaving stamps and small covers alone", async () => {
		insertBook("aaaaaaa1", BIG);
		insertBook("aaaaaaa2", BIG);
		insertBook("aaaaaaa3", SMALL);
		insertBook("aaaaaaa4", null);
		insertSeries("bbbbbbb1", BIG);
		const before = stamps();
		const { deps, isDone } = makeDeps("opfs");

		expect(await runCoverShrink(deps)).toEqual({ shrunk: 3, kept: 0 });

		expect(bookCover("aaaaaaa1")).toBe(SMALL);
		expect(bookCover("aaaaaaa2")).toBe(SMALL);
		expect(bookCover("aaaaaaa3")).toBe(SMALL);
		expect(bookCover("aaaaaaa4")).toBeNull();
		expect(seriesCover("bbbbbbb1")).toBe(SMALL);
		expect(stamps()).toEqual(before);
		expect(isDone()).toBe(true);
		expect(deps.shrink).toHaveBeenCalledTimes(3);

		expect(await runCoverShrink(deps)).toBeNull();
		expect(deps.shrink).toHaveBeenCalledTimes(3);
	});

	it("keeps a cover it cannot shrink and still finishes the pass", async () => {
		const broken = `data:image/png;base64,${"C".repeat(COVER_BUDGET_CHARS * 2)}`;
		insertBook("aaaaaaa1", UNDECODABLE);
		insertBook("aaaaaaa2", broken);
		insertBook("aaaaaaa3", BIG);
		const { deps, isDone } = makeDeps("native");
		deps.shrink.mockImplementation(async (cover: string) => {
			if (cover === broken) throw new Error("decode failed");
			return cover === UNDECODABLE ? cover : SMALL;
		});

		expect(await runCoverShrink(deps)).toEqual({ shrunk: 1, kept: 2 });

		expect(bookCover("aaaaaaa1")).toBe(UNDECODABLE);
		expect(bookCover("aaaaaaa2")).toBe(broken);
		expect(bookCover("aaaaaaa3")).toBe(SMALL);
		expect(isDone()).toBe(true);
	});

	it("resumes a pass cut short and marks the device done only at the end", async () => {
		insertBook("aaaaaaa1", BIG);
		insertBook("aaaaaaa2", BIG);
		insertSeries("bbbbbbb1", BIG);
		const { deps, isDone } = makeDeps("opfs");
		deps.pause.mockResolvedValueOnce().mockRejectedValueOnce(new Error("app closed"));

		await expect(runCoverShrink(deps)).rejects.toThrow("app closed");
		expect(isDone()).toBe(false);
		expect(await getOversizedCovers(COVER_BUDGET_CHARS)).toHaveLength(2);

		expect(await runCoverShrink(deps)).toEqual({ shrunk: 2, kept: 0 });
		expect(await getOversizedCovers(COVER_BUDGET_CHARS)).toEqual([]);
		expect(isDone()).toBe(true);
	});

	it("ends unmarked when the database fails mid-pass", async () => {
		insertBook("aaaaaaa1", BIG);
		const { deps, isDone } = makeDeps("opfs");
		const failing = { ...deps, replace: vi.fn(async () => Promise.reject(new Error("closed"))) };

		await expect(runCoverShrink(failing)).rejects.toThrow("closed");
		expect(isDone()).toBe(false);
		expect(bookCover("aaaaaaa1")).toBe(BIG);
	});

	it("waits on the legacy web store and runs once the library is on OPFS", async () => {
		insertBook("aaaaaaa1", BIG);
		const legacy = makeDeps("legacy");

		expect(await runCoverShrink(legacy.deps)).toBeNull();
		expect(legacy.deps.isDone).not.toHaveBeenCalled();
		expect(legacy.deps.shrink).not.toHaveBeenCalled();
		expect(legacy.isDone()).toBe(false);
		expect(bookCover("aaaaaaa1")).toBe(BIG);

		const moved = makeDeps("opfs");
		expect(await runCoverShrink(moved.deps)).toEqual({ shrunk: 1, kept: 0 });
		expect(bookCover("aaaaaaa1")).toBe(SMALL);
	});

	it("does not run without an open database", async () => {
		insertBook("aaaaaaa1", BIG);
		const { deps } = makeDeps(null);
		expect(await runCoverShrink(deps)).toBeNull();
		expect(bookCover("aaaaaaa1")).toBe(BIG);
	});
});

describe("replaceStoredCover", () => {
	it("leaves a cover that changed since it was read", async () => {
		insertBook("aaaaaaa1", BIG);
		raw.prepare("UPDATE book_content SET cover_image = ? WHERE book_id = 'aaaaaaa1'").run(SMALL);

		await replaceStoredCover({ table: "book", id: "aaaaaaa1" }, BIG, "data:image/webp;base64,eA==");

		expect(bookCover("aaaaaaa1")).toBe(SMALL);

		insertSeries("s1", BIG);
		raw.prepare("UPDATE series SET cover_image = ? WHERE id = 's1'").run(SMALL);

		await replaceStoredCover({ table: "series", id: "s1" }, BIG, "data:image/webp;base64,eA==");

		expect(seriesCover("s1")).toBe(SMALL);
	});
});

describe("normalizeIncomingCover", () => {
	it("passes covers within the budget through untouched", async () => {
		expect(await normalizeIncomingCover(SMALL)).toBe(SMALL);
		expect(await normalizeIncomingCover(null)).toBeNull();
		expect(await normalizeIncomingCover(undefined)).toBeNull();
		expect(normalizeCoverDataUrl).not.toHaveBeenCalled();
	});

	it("normalizes an oversized cover, and keeps it when normalizing throws", async () => {
		normalizeCoverDataUrl.mockResolvedValueOnce(SMALL);
		expect(await normalizeIncomingCover(BIG)).toBe(SMALL);

		normalizeCoverDataUrl.mockRejectedValueOnce(new Error("decode failed"));
		expect(await normalizeIncomingCover(BIG)).toBe(BIG);
	});
});

describe("startCoverShrink", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("starts after the first render, not during startup, and only once", async () => {
		vi.useFakeTimers();
		insertBook("aaaaaaa1", BIG);
		const { deps } = makeDeps("opfs");

		startCoverShrink(deps);
		startCoverShrink(deps);
		expect(deps.storageKind).not.toHaveBeenCalled();

		await vi.runAllTimersAsync();
		expect(deps.storageKind).toHaveBeenCalledTimes(1);
		expect(bookCover("aaaaaaa1")).toBe(SMALL);
	});
});
