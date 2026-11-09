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
	it("sit above the labelled corner pills, which are too wide to share their row on a phone", () => {
		const PILL = 44;
		const GAP = 8;
		const pillsTop = px(".rsvp-dict-button", "bottom") + PILL;
		const voicePillsTop = px(".rsvp-sleep-button", "bottom") + PILL;
		expect(px(".rsvp-controls", "bottom")).toBeGreaterThanOrEqual(pillsTop + GAP);
		expect(px(".rsvp-controls:has(~ .rsvp-voice-button)", "bottom")).toBeGreaterThanOrEqual(
			voicePillsTop + GAP,
		);
	});
});
