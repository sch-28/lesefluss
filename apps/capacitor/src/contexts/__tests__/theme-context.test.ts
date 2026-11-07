import { afterEach, describe, expect, it } from "vitest";
import {
	applyAppearance,
	applyThemeColor,
	focalLetterColorFor,
	isDarkTheme,
	storedThemeFor,
	themeClasses,
	themeColorFor,
} from "../theme-context";

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

describe("theme color", () => {
	afterEach(() => {
		document.head.querySelector('meta[name="theme-color"]')?.remove();
	});

	it("follows the theme, and e-ink paints white", () => {
		expect(themeColorFor("dark", false)).toBe("#0c0d0e");
		expect(themeColorFor("sepia", false)).toBe("#c4b081");
		expect(themeColorFor("dark", true)).toBe("#ffffff");
	});

	it("rewrites the theme-color meta when the theme changes", () => {
		const meta = document.createElement("meta");
		meta.name = "theme-color";
		meta.content = "#fdfcfb";
		document.head.append(meta);
		applyAppearance("high-contrast", 16, false);
		expect(meta.content).toBe("#000000");
		applyAppearance("sepia", 16, true);
		expect(meta.content).toBe("#ffffff");
	});

	it("does nothing without the meta, as in the Android build", () => {
		expect(() => applyThemeColor("#000000")).not.toThrow();
		expect(document.head.querySelector('meta[name="theme-color"]')).toBeNull();
	});
});
