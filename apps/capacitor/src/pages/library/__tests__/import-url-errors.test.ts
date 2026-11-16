import { describe, expect, it } from "vitest";
import { urlImportErrorText } from "../import-errors";

describe("urlImportErrorText", () => {
	it("says nothing for a cancelled import", () => {
		expect(urlImportErrorText(new Error("CANCELLED"))).toBeNull();
	});

	it("names what to try next for a known failure", () => {
		expect(urlImportErrorText(new Error("INVALID_URL"))).toContain("https://");
		expect(urlImportErrorText(new Error("CLOUDFLARE_CHALLENGE"))).toContain("Paste text");
	});

	it("falls back to a generic hint for an unknown failure or a non-Error", () => {
		const generic = urlImportErrorText(new Error("SOMETHING_NEW"));
		expect(generic).toContain("Couldn't import this page");
		expect(urlImportErrorText("boom")).toBe(generic);
	});
});
