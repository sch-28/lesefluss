import { SETTING_CONSTRAINTS } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_TEXT_SPACING,
	effectiveTextAlign,
	percentOfFont,
	readerFontFamilyFor,
	readerFontStack,
	readerLayoutFor,
	readingRulerFor,
	round2,
	spacingLabel,
	stepSetting,
	textAlignFor,
	textAlignVars,
	textSpacingFor,
	textSpacingKey,
	textSpacingVars,
} from "../use-appearance-settings";

const defaultSpacing = DEFAULT_TEXT_SPACING;

describe("textSpacingVars", () => {
	it("sets no letter or word spacing by default, and today's paragraph gap", () => {
		expect(textSpacingVars(defaultSpacing)).toEqual({ "--reader-paragraph-spacing": "1.1em" });
	});

	it("sets each spacing in em", () => {
		expect(textSpacingVars({ letter: 0.04, word: 0.15, paragraph: 2 })).toEqual({
			"--reader-letter-spacing": "0.04em",
			"--reader-word-spacing": "0.15em",
			"--reader-paragraph-spacing": "2em",
		});
	});

	it.each(["letter", "word", "paragraph"] as const)("keys %s spacing into the layout", (kind) => {
		expect(textSpacingKey(defaultSpacing)).not.toBe(
			textSpacingKey({ ...defaultSpacing, [kind]: defaultSpacing[kind] + 0.04 }),
		);
	});
});

describe("textSpacingFor", () => {
	it("reads unset spacing as today's rendering", () => {
		expect(textSpacingFor(undefined)).toEqual(defaultSpacing);
		expect(textSpacingFor({})).toEqual(defaultSpacing);
	});

	it("moves an off-grid value onto the steppers' grid", () => {
		expect(
			textSpacingFor({ readerLetterSpacing: 0.06, readerParagraphSpacing: 1.2 }),
		).toMatchObject({
			letter: 0.08,
			paragraph: 1.1,
		});
	});

	it("rounds a stored float and keeps it in range", () => {
		expect(
			textSpacingFor({
				readerLetterSpacing: 0.12000000000000001,
				readerWordSpacing: 9,
				readerParagraphSpacing: 0.1,
			}),
		).toEqual({
			letter: 0.12,
			word: SETTING_CONSTRAINTS.READER_WORD_SPACING.max,
			paragraph: SETTING_CONSTRAINTS.READER_PARAGRAPH_SPACING.min,
		});
	});
});

describe("spacingLabel", () => {
	it("says Default for the value that renders as without the setting", () => {
		expect(spacingLabel(0, 0, percentOfFont)).toBe("Default");
		expect(spacingLabel(0.08, 0, percentOfFont)).toBe("8%");
	});
});

describe("stepSetting", () => {
	const letter = SETTING_CONSTRAINTS.READER_LETTER_SPACING;

	it("steps without floating-point drift", () => {
		let value = 0;
		for (let i = 0; i < 3; i++) value = stepSetting(value, letter.step, letter, round2);
		expect(value).toBe(0.12);
	});

	it("stays inside the range", () => {
		expect(stepSetting(letter.max, letter.step, letter, round2)).toBe(letter.max);
		expect(stepSetting(letter.min, -letter.step, letter, round2)).toBe(letter.min);
	});
});

describe("percentOfFont", () => {
	it("shows added em as a share of the font size", () => {
		expect(percentOfFont(0.06)).toBe("6%");
		expect(percentOfFont(0)).toBe("0%");
	});
});

describe("readerFontFamilyFor", () => {
	it("reads a font from a newer app version as Sans", () => {
		expect(readerFontFamilyFor("comic-neue")).toBe("sans");
		expect(readerFontStack("comic-neue")).toBeUndefined();
	});

	it.each(["serif", "atkinson", "opendyslexic", "literata"])("keeps the known font %s", (font) => {
		expect(readerFontFamilyFor(font)).toBe(font);
	});

	it("sets the bundled fonts by their face, with a fallback of the same kind", () => {
		expect(readerFontStack("atkinson")).toBe("'Atkinson Hyperlegible', sans-serif");
		expect(readerFontStack("opendyslexic")).toBe("OpenDyslexic, sans-serif");
		expect(readerFontStack("literata")).toMatch(/^Literata, Georgia/);
		expect(readerFontStack("sans")).toBeUndefined();
	});
});

describe("textAlignFor", () => {
	it("reads unset or unknown alignment as left", () => {
		expect(textAlignFor(undefined)).toBe("left");
		expect(textAlignFor("center")).toBe("left");
		expect(textAlignFor("justify")).toBe("justify");
	});
});

describe("textAlignVars", () => {
	it("sets alignment and hyphenation only for justify, so left renders unhyphenated", () => {
		expect(textAlignVars("left")).toEqual({});
		expect(textAlignVars("justify")).toEqual({
			"--reader-text-align": "justify",
			"--reader-hyphens": "auto",
		});
	});
});

describe("effectiveTextAlign", () => {
	it("justifies a line of 16em or more", () => {
		expect(effectiveTextAlign("justify", 320, 20, 0)).toBe("justify");
		expect(effectiveTextAlign("justify", 319, 20, 0)).toBe("left");
	});

	it("counts letter spacing as wider type", () => {
		expect(effectiveTextAlign("justify", 320, 20, 0.1)).toBe("left");
		expect(effectiveTextAlign("justify", 384, 20, 0.1)).toBe("justify");
	});

	it("never justifies a left-aligned setting", () => {
		expect(effectiveTextAlign("left", 2000, 16, 0)).toBe("left");
	});
});

describe("readerLayoutFor", () => {
	const stored = { paginationStyle: "page", pageTurnAnimation: true } as const;

	it("keeps the stored animation when nothing forces turns instant", () => {
		expect(readerLayoutFor(stored, false, false)).toEqual({
			paginationStyle: "page",
			pageTurnAnimation: true,
			pageTurnAnimationOffBy: null,
		});
	});

	it("turns the animation off under OS reduce motion and says why", () => {
		expect(readerLayoutFor(stored, false, true)).toEqual({
			paginationStyle: "page",
			pageTurnAnimation: false,
			pageTurnAnimationOffBy: "reduce-motion",
		});
	});

	it("lets e-ink mode win, forcing page mode as well", () => {
		expect(readerLayoutFor({ ...stored, paginationStyle: "scroll" }, true, true)).toEqual({
			paginationStyle: "page",
			pageTurnAnimation: false,
			pageTurnAnimationOffBy: "eink",
		});
	});
});

describe("readingRulerFor", () => {
	it("is off with one line by default", () => {
		expect(readingRulerFor(undefined)).toEqual({ isOn: false, lines: 1 });
	});

	it("keeps the line count while the ruler is off", () => {
		expect(readingRulerFor({ readerRuler: false, readerRulerLines: 3 })).toEqual({
			isOn: false,
			lines: 3,
		});
	});

	it("clamps a line count outside 1-3", () => {
		expect(readingRulerFor({ readerRuler: true, readerRulerLines: 7 }).lines).toBe(3);
		expect(readingRulerFor({ readerRuler: true, readerRulerLines: 0 }).lines).toBe(1);
	});
});
