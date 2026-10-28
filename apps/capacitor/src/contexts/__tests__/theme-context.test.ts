import { describe, expect, it } from "vitest";
import { focalLetterColorFor, isDarkTheme, storedThemeFor, themeClasses } from "../theme-context";

describe("storedThemeFor", () => {
	it("reads a theme from a newer app version as dark", () => {
		expect(storedThemeFor("contrast")).toBe("dark");
	});

	it("keeps a known theme", () => {
		expect(storedThemeFor("sepia")).toBe("sepia");
		expect(storedThemeFor("high-contrast")).toBe("high-contrast");
	});
});

describe("high contrast counts as dark", () => {
	it("puts the dark class next to its own", () => {
		expect(themeClasses("high-contrast")).toEqual(["dark", "high-contrast"]);
		expect(themeClasses("sepia")).toEqual(["sepia"]);
	});

	it("is dark for charts", () => {
		expect(isDarkTheme("high-contrast")).toBe(true);
		expect(isDarkTheme("dark")).toBe(true);
		expect(isDarkTheme("light")).toBe(false);
	});
});

describe("focalLetterColorFor", () => {
	it("lightens only the presets under 7:1 on black, only in high contrast", () => {
		expect(focalLetterColorFor("#ff0000", "high-contrast")).toBe("#ff6b6b");
		expect(focalLetterColorFor("#448AFF", "high-contrast")).toBe("#82b1ff");
		expect(focalLetterColorFor("#ffcc00", "high-contrast")).toBe("#ffcc00");
		expect(focalLetterColorFor("#ff0000", "dark")).toBe("#ff0000");
	});
});
