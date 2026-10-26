import { describe, expect, it } from "vitest";
import { storedThemeFor } from "../theme-context";

describe("storedThemeFor", () => {
	it("reads a theme from a newer app version as dark", () => {
		expect(storedThemeFor("contrast")).toBe("dark");
	});

	it("keeps a known theme", () => {
		expect(storedThemeFor("sepia")).toBe("sepia");
	});
});
