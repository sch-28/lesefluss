import { describe, expect, it } from "vitest";
import { normalizeSeriesKey, seriesCollectionId } from "../series-key";

describe("normalizeSeriesKey", () => {
	it("folds case, punctuation runs and spacing", () => {
		expect(normalizeSeriesKey("  The Wheel-of  Time! ")).toBe("the wheel of time");
		expect(normalizeSeriesKey("the wheel of time")).toBe("the wheel of time");
	});

	it("keeps leading articles", () => {
		expect(normalizeSeriesKey("The Expanse")).not.toBe(normalizeSeriesKey("Expanse"));
	});

	it("applies NFKC so composed and decomposed forms match", () => {
		expect(normalizeSeriesKey("Café")).toBe(normalizeSeriesKey("Café"));
		expect(normalizeSeriesKey("ＡＢ")).toBe("ab");
	});

	it("keeps letters of any script", () => {
		expect(normalizeSeriesKey("Чёрный город")).toBe("чёрный город");
	});

	it("keeps combining marks NFKC does not compose, so such names stay apart", () => {
		expect(normalizeSeriesKey("कमल")).not.toBe(normalizeSeriesKey("कमला"));
		expect(normalizeSeriesKey("हिन्दी")).toBe("हिन्दी");
	});

	it("caps the key at the wire limit", () => {
		expect(normalizeSeriesKey("\ufb03".repeat(150))?.length).toBe(200);
	});

	it("gives null for empty or punctuation-only names", () => {
		expect(normalizeSeriesKey(null)).toBeNull();
		expect(normalizeSeriesKey("")).toBeNull();
		expect(normalizeSeriesKey(" -- ")).toBeNull();
	});
});

describe("seriesCollectionId", () => {
	it("is stable, prefixed and fits the collection id limit", () => {
		const id = seriesCollectionId("the expanse");
		expect(id).toBe(seriesCollectionId("the expanse"));
		expect(id).toMatch(/^series-[0-9a-f]{16}$/);
		expect(id.length).toBeLessThanOrEqual(64);
	});

	it("differs between keys", () => {
		expect(seriesCollectionId("the expanse")).not.toBe(seriesCollectionId("expanse"));
	});
});
