import { afterEach, describe, expect, it, vi } from "vitest";
import { ttlCache } from "../ttl-cache.js";

afterEach(() => {
	vi.useRealTimers();
});

describe("ttlCache", () => {
	it("serves a hit without reloading", async () => {
		const cache = ttlCache<number>(1000);
		const load = vi.fn(async () => 1);
		await cache.get("a", load);
		await cache.get("a", load);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it("never holds more than maxEntries keys", async () => {
		const cache = ttlCache<number>(60_000, 3);
		for (const key of ["a", "b", "c", "d", "e"]) await cache.get(key, async () => 1);
		expect(cache.size).toBe(3);
	});

	it("sweeps expired entries when a new key is loaded", async () => {
		vi.useFakeTimers();
		const cache = ttlCache<number>(1000, 10);
		await cache.get("a", async () => 1);
		await cache.get("b", async () => 1);
		vi.advanceTimersByTime(1001);
		await cache.get("c", async () => 1);
		expect(cache.size).toBe(1);
	});

	it("drops a failed load so the next call retries", async () => {
		const cache = ttlCache<number>(60_000);
		await expect(cache.get("a", () => Promise.reject(new Error("x")))).rejects.toThrow();
		await Promise.resolve();
		const load = vi.fn(async () => 2);
		await expect(cache.get("a", load)).resolves.toBe(2);
	});
});
