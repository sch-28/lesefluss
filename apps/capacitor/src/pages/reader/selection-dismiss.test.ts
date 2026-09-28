import { describe, expect, it } from "vitest";
import { markerDetail } from "./buddy-read-markers";
import { shouldDismissSelectionOnKey } from "./use-keyboard-shortcuts";

function el(html: string): Element {
	const host = document.createElement("div");
	host.innerHTML = html;
	return host.firstElementChild as Element;
}

describe("shouldDismissSelectionOnKey", () => {
	const base = { key: "Escape", hasSelection: true, target: null, hasOverlay: false };

	it("dismisses an open selection on Escape, also with a toolbar button focused", () => {
		expect(shouldDismissSelectionOnKey(base)).toBe(true);
		expect(shouldDismissSelectionOnKey({ ...base, target: el("<button>Highlight</button>") })).toBe(
			true,
		);
	});

	it("leaves Escape alone without a selection, while typing, or with an overlay open", () => {
		expect(shouldDismissSelectionOnKey({ ...base, hasSelection: false })).toBe(false);
		expect(shouldDismissSelectionOnKey({ ...base, target: el("<textarea></textarea>") })).toBe(
			false,
		);
		expect(shouldDismissSelectionOnKey({ ...base, target: el("<input />") })).toBe(false);
		expect(shouldDismissSelectionOnKey({ ...base, hasOverlay: true })).toBe(false);
	});

	it("ignores other keys", () => {
		expect(shouldDismissSelectionOnKey({ ...base, key: "r" })).toBe(false);
		expect(shouldDismissSelectionOnKey({ ...base, key: " " })).toBe(false);
	});
});

describe("markerDetail", () => {
	const live = { userId: "u", wordPosition: 500, wordCount: 1000, wpm: 280 };

	it("shows the word gap when positions compare exactly", () => {
		expect(markerDetail({ live, wordPosition: 500 }, 200, false)).toBe(
			"reading now · 280 wpm · 300 words ahead",
		);
		expect(markerDetail({ live: null, wordPosition: 100 }, 200, false)).toBe("100 words behind");
	});

	it("leaves the word gap out when positions are approximate", () => {
		expect(markerDetail({ live, wordPosition: 500 }, 200, true)).toBe("reading now · 280 wpm");
		expect(markerDetail({ live: null, wordPosition: 500 }, 200, true)).toBe("");
	});
});
