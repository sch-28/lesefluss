import { describe, expect, it } from "vitest";
import { formatKey, matchesKey } from "../keys";

function key(k: string, mods: Partial<KeyboardEventInit> = {}) {
	return new KeyboardEvent("keydown", { key: k, ...mods });
}

describe("matchesKey", () => {
	it("matches Shift on the modifier, not the letter's case", () => {
		expect(matchesKey(key("B", { shiftKey: true }), "Shift+B")).toBe(true);
		// CapsLock on: Shift+B still arrives with shiftKey, now as a lowercase b.
		expect(matchesKey(key("b", { shiftKey: true }), "Shift+B")).toBe(true);
		// CapsLock alone is not Shift+B, and still a plain b.
		expect(matchesKey(key("B"), "Shift+B")).toBe(false);
		expect(matchesKey(key("B"), "b")).toBe(true);
		expect(matchesKey(key("b", { shiftKey: true }), "b")).toBe(false);
	});

	it("takes Ctrl as Mod, Cmd on macOS, and never a plain key for a Mod one", () => {
		expect(matchesKey(key("k", { ctrlKey: true }), "Mod+K", false)).toBe(true);
		expect(matchesKey(key("k", { metaKey: true }), "Mod+K", true)).toBe(true);
		// Ctrl+K on macOS is the text fields' kill-line, not the palette.
		expect(matchesKey(key("k", { ctrlKey: true }), "Mod+K", true)).toBe(false);
		expect(matchesKey(key("k"), "Mod+K", false)).toBe(false);
		expect(matchesKey(key("r", { ctrlKey: true }), "r")).toBe(false);
		expect(matchesKey(key("r", { metaKey: true }), "r")).toBe(false);
	});

	it("does not need Shift spelled out for a shifted symbol", () => {
		expect(matchesKey(key("?", { shiftKey: true }), "?")).toBe(true);
		expect(matchesKey(key(" "), "Space")).toBe(true);
		expect(matchesKey(key("ArrowRight", { metaKey: true }), "Mod+ArrowRight", true)).toBe(true);
		expect(matchesKey(key("ArrowRight"), "Mod+ArrowRight")).toBe(false);
	});
});

describe("formatKey", () => {
	it("names the platform's modifier", () => {
		expect(formatKey("Mod+K", false)).toEqual(["Ctrl", "K"]);
		expect(formatKey("Mod+K", true)).toEqual(["⌘", "K"]);
		expect(formatKey("Shift+B", false)).toEqual(["Shift", "B"]);
		expect(formatKey("r", false)).toEqual(["R"]);
		expect(formatKey("Space", false)).toEqual(["Space"]);
	});
});
