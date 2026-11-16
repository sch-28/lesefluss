import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "../../../theme/monochrome.css"),
	"utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");
/** The cascade's value of `prop` for `selector`: the last rule that lists it and sets it. */
const px = (selector: string, prop: string) => {
	let value = Number.NaN;
	for (const [, selectors, body] of CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
		if (!selectors.split(",").some((s) => s.trim() === selector)) continue;
		const set = body.match(new RegExp(`(?:^|;|\\s)${prop}: (\\d+)px;`))?.[1];
		if (set) value = Number(set);
	}
	return value;
};

describe("RSVP paused controls layout", () => {
	it("sit above the one row of secondary pills, with or without the read-aloud pills", () => {
		const PILL = 44;
		const GAP = 8;
		const pillsTop = px(".rsvp-pills", "bottom") + PILL;
		expect(px(".rsvp-controls", "bottom")).toBeGreaterThanOrEqual(pillsTop + GAP);
		expect(CSS).not.toMatch(/\.rsvp-controls:has/);
	});

	it("give the RSVP word, Quick RSVP, the speed test and the settings preview one focal font", () => {
		const focal = CSS.match(/--rsvp-focal-font: ([^;]+);/)?.[1];
		expect(focal).toBeTruthy();
		for (const selector of [".rsvp-word-container", ".rsvp-preview-word", ".rsvp-mini-word"]) {
			const body = CSS.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
			expect(body, selector).toContain("font-family: var(--rsvp-focal-font)");
		}
	});
});
