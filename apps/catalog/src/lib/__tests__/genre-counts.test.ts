import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/index.js", () => ({ db: {} }));
vi.mock("../error-tracking.js", () => ({ captureException: vi.fn() }));

const { GENRES } = await import("../genres.js");
const { genreCountsCache, genreCountsFor, sumByLanguage } = await import("../genre-counts.js");

const row = (lang: string | null, ...counts: number[]) => ({
	lang,
	...Object.fromEntries(counts.map((n, i) => [`g${i}`, n])),
});

const countsOf = (n: number) => new Map([["all", GENRES.map(() => n)]]);

afterEach(() => {
	vi.useRealTimers();
});

describe("sumByLanguage", () => {
	it("keeps each language's counts and sums every row, unknown language included, into all", () => {
		const byLanguage = sumByLanguage([row("en", 5, 2), row("de", 1, 0), row(null, 3, 1)]);
		expect(
			genreCountsFor(byLanguage, "en")
				.slice(0, 2)
				.map((g) => g.count),
		).toEqual([5, 2]);
		expect(
			genreCountsFor(byLanguage, "all")
				.slice(0, 2)
				.map((g) => g.count),
		).toEqual([9, 3]);
		expect(byLanguage.has("null")).toBe(false);
	});

	it("answers every genre with zero for a language without books", () => {
		const genres = genreCountsFor(sumByLanguage([row("en", 5)]), "fr");
		expect(genres.map((g) => g.id)).toEqual(GENRES.map((g) => g.id));
		expect(genres.every((g) => g.count === 0)).toBe(true);
	});
});

describe("genreCountsCache", () => {
	it("loads once for every language", async () => {
		const load = vi.fn(async () => sumByLanguage([row("en", 4)]));
		const cache = genreCountsCache(load);
		await Promise.all([cache.get("en"), cache.get("all"), cache.get("de")]);
		await cache.get("en");
		expect(load).toHaveBeenCalledTimes(1);
	});

	it("serves expired counts at once and swaps in the reload when it lands", async () => {
		vi.useFakeTimers();
		let resolve: (v: Map<string, number[]>) => void = () => undefined;
		const load = vi
			.fn<() => Promise<Map<string, number[]>>>()
			.mockResolvedValueOnce(countsOf(1))
			.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
		const cache = genreCountsCache(load, 1000);
		await cache.get("all");
		vi.advanceTimersByTime(1001);

		expect((await cache.get("all"))[0]?.count).toBe(1);
		expect(load).toHaveBeenCalledTimes(2);
		resolve(countsOf(2));
		await vi.waitFor(async () => expect((await cache.get("all"))[0]?.count).toBe(2));
	});

	it("loads again after a change instead of reusing a load that was already running", async () => {
		let resolveFirst: (v: Map<string, number[]>) => void = () => undefined;
		const load = vi
			.fn<() => Promise<Map<string, number[]>>>()
			.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
			.mockResolvedValueOnce(countsOf(2));
		const cache = genreCountsCache(load);
		const first = cache.refresh();
		const afterSync = cache.refresh(true);
		resolveFirst(countsOf(1));
		await first;
		expect((await afterSync).get("all")?.[0]).toBe(2);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it("keeps the old counts when a refresh fails, and retries a failed first load", async () => {
		const load = vi
			.fn<() => Promise<Map<string, number[]>>>()
			.mockRejectedValueOnce(new Error("down"))
			.mockResolvedValueOnce(countsOf(1))
			.mockRejectedValueOnce(new Error("down"));
		const cache = genreCountsCache(load);
		await expect(cache.get("all")).rejects.toThrow("down");
		expect((await cache.get("all"))[0]?.count).toBe(1);
		await expect(cache.refresh()).rejects.toThrow("down");
		expect((await cache.get("all"))[0]?.count).toBe(1);
	});
});
