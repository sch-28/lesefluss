import { describe, expect, it } from "vitest";
import { detectScraper, isSerialUrl, searchAll } from "../registry";

describe("isSerialUrl", () => {
	it.each([
		"https://archiveofourown.org/works/12345",
		"https://archiveofourown.org/works/12345/chapters/67890",
		"https://archiveofourown.org/works/12345?view_full_work=true",
	])("accepts AO3 work URL: %s", (url) => {
		expect(isSerialUrl(url)).toBe(true);
	});

	it.each([
		"https://archiveofourown.org/series/12345", // /series/ is out of scope
		"https://archiveofourown.org/users/foo", // not a /works/ path
		"https://example.com/works/123", // wrong host
		"not-a-url",
		"",
	])("rejects non-importable URL: %s", (url) => {
		expect(isSerialUrl(url)).toBe(false);
	});
});

describe("detectScraper", () => {
	it("returns the AO3 adapter for an AO3 work URL", () => {
		const s = detectScraper("https://archiveofourown.org/works/123");
		expect(s?.id).toBe("ao3");
	});

	it("returns null when no provider matches", () => {
		expect(detectScraper("https://example.com/foo")).toBeNull();
	});
});

describe("searchAll", () => {
	it("short-circuits on empty / whitespace-only query", async () => {
		const empty = await searchAll("");
		expect(empty).toEqual({ results: [], failedProviders: [] });

		const ws = await searchAll("   ");
		expect(ws).toEqual({ results: [], failedProviders: [] });
	});
});
