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
	it("sit above the secondary pills, and above both stacked rows with the read-aloud pills", () => {
		const PILL = 44;
		const GAP = 8;
		const pillsTop = px(".rsvp-pills", "bottom") + PILL;
		expect(px(".rsvp-controls", "bottom")).toBeGreaterThanOrEqual(pillsTop + GAP);
		const stackGap = CSS.match(/\.rsvp-pill-stack \{[^}]*gap: (\d+)px;/)?.[1];
		expect(px(".rsvp-controls--voice", "bottom")).toBeGreaterThanOrEqual(
			pillsTop + Number(stackGap) + PILL + GAP,
		);
		expect(CSS).not.toMatch(/\.rsvp-controls:has/);
	});

	it("keeps Listen beside the speed instead of wrapping it onto its own row", () => {
		expect(CSS).toMatch(/\.rsvp-controls \.rsvp-wpm-stepper \{[^}]*flex-wrap: nowrap;/);
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
