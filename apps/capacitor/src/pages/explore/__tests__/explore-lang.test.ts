import { describe, expect, it } from "vitest";
import { pickDefaultLang } from "../use-explore-lang";

const available = [
	{ code: "en", count: 15000 },
	{ code: "de", count: 240 },
	{ code: "xx", count: 0 },
];

describe("pickDefaultLang", () => {
	it("follows the device locale when the catalog has books in it", () => {
		expect(pickDefaultLang("de-AT", available)).toBe("de");
	});

	it("falls back to English otherwise", () => {
		expect(pickDefaultLang("ja-JP", available)).toBe("en");
		expect(pickDefaultLang("xx", available)).toBe("en");
		expect(pickDefaultLang(undefined, available)).toBe("en");
	});
});
