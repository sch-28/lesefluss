import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pillFit } from "../rsvp-band-layout";

describe("pillFit", () => {
	const CARD = 246;
	const GAP = 8;

	it("keeps the labels where the widest labelled button fits beside the card", () => {
		expect(pillFit(676, CARD, 140, GAP)).toBe("labels");
	});

	it("drops the labels on a 384px phone, where only the 44px icons fit", () => {
		expect(pillFit(360, CARD, 140, GAP)).toBe("icons");
	});

	it("lifts the buttons above the card where not even the icons fit beside it", () => {
		expect(pillFit(336, CARD, 140, GAP)).toBe("above");
	});
});

describe("the band's CSS on a 360px Android phone", () => {
	const css = readFileSync(
		join(dirname(fileURLToPath(import.meta.url)), "../../../theme/monochrome.css"),
		"utf8",
	).replace(/\/\*[\s\S]*?\*\//g, "");
	const band = css.match(/\.rsvp-band \{([^}]*)\}/)?.[1] ?? "";

	it("keeps the icons beside the 246px card", () => {
		const inset = Number(band.match(/\sleft: (\d+)px;/)?.[1]);
		const columnGap = Number(band.match(/\sgap: \d+px (\d+)px;/)?.[1]);
		expect(pillFit(360 - 2 * inset, 246, 140, columnGap)).toBe("icons");
	});
});
