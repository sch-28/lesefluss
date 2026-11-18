import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "../../../theme/monochrome.css"),
	"utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

describe("RSVP paused controls layout", () => {
	it("sit on the progress bar, in one band with the side buttons, not floating above them", () => {
		const band = CSS.match(/\.rsvp-band \{([^}]*)\}/)?.[1] ?? "";
		expect(band).toContain("bottom: calc(12px + var(--rsvp-bar-overlap, 0px));");
		const card = CSS.match(/\.rsvp-controls \{([^}]*)\}/)?.[1] ?? "";
		expect(card).toContain("grid-area: card");
		expect(card).not.toMatch(/position: absolute|bottom:/);
		expect(CSS).toMatch(/grid-template-areas: "start card end";/);
	});

	it("place the word halfway between the paused and the playing centre, so it never sits low behind the controls", () => {
		const word = CSS.match(/\.rsvp-word-container \{([^}]*)\}/)?.[1] ?? "";
		expect(word).toContain("top: calc(50% - var(--rsvp-band-space) / 4);");
		const guide = CSS.match(/\.rsvp-display \.rsvp-focal-line \{([^}]*)\}/)?.[1] ?? "";
		expect(guide, "the focal guide frames the word").toContain(
			"top: calc(50% - var(--rsvp-band-space) / 4 - 2.2rem);",
		);
		const peek = (name: string) => CSS.match(new RegExp(`\\${name} \\{([^}]*)\\}`))?.[1] ?? "";
		expect(peek(".rsvp-context-prev")).toContain("50cqh - var(--rsvp-band-space) / 4");
		expect(peek(".rsvp-context-next"), "stops at the band").toContain(
			"50cqh - var(--rsvp-band-space) * 0.75",
		);
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
