import { describe, expect, it } from "vitest";
import type { SearchAllResult } from "../../../serial-scrapers";
import { nextSerialPage } from "../use-serials";

const page = (ids: number[], failed = false): SearchAllResult => ({
	results: ids.map((i) => ({
		title: `t${i}`,
		provider: "royalroad",
		sourceUrl: `https://www.royalroad.com/fiction/${i}`,
	})),
	failedProviders: failed ? ["royalroad"] : [],
	challengeProviders: [],
});
const full = (from: number) => page(Array.from({ length: 20 }, (_, i) => from + i));

describe("nextSerialPage", () => {
	it("asks for the next page after a full page of new series", () => {
		expect(nextSerialPage(full(0), [full(0)])).toBe(2);
	});

	it("stops on a short page", () => {
		expect(nextSerialPage(page([1, 2, 3]), [full(0), page([1, 2, 3])])).toBeUndefined();
	});

	it("stops when a full page repeats what was already listed", () => {
		expect(nextSerialPage(full(0), [full(0), full(0)])).toBeUndefined();
	});

	it("stops on a failed page so the caller can offer a retry", () => {
		expect(nextSerialPage(page([], true), [full(0), page([], true)])).toBeUndefined();
	});
});
