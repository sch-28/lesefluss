import type { ChangelogEntry } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { whatsNewLayout } from "../whats-new-layout";

const entry = (title: string, date: string, highlight?: boolean): ChangelogEntry => ({
	title,
	date,
	tags: ["App"],
	changes: [`${title} change`],
	...(highlight && { highlight }),
});

const titles = (entries: ChangelogEntry[]) => entries.map((e) => e.title);

describe("whatsNewLayout", () => {
	it("tiles the newest release's highlights and puts the rest under Also new", () => {
		const layout = whatsNewLayout([
			entry("A", "2026-11-15", true),
			entry("B", "2026-11-15"),
			entry("C", "2026-11-15", true),
		]);
		expect(titles(layout.tiles)).toEqual(["A", "C"]);
		expect(titles(layout.alsoNew)).toEqual(["B"]);
		expect(layout.newestDate).toBe("2026-11-15");
	});

	it("caps the tiles at three, the other highlights go to Also new", () => {
		const layout = whatsNewLayout(["A", "B", "C", "D"].map((t) => entry(t, "2026-11-15", true)));
		expect(titles(layout.tiles)).toEqual(["A", "B", "C"]);
		expect(titles(layout.alsoNew)).toEqual(["D"]);
	});

	it("tiles the first three entries when none is highlighted", () => {
		const layout = whatsNewLayout(["A", "B", "C", "D"].map((t) => entry(t, "2026-11-15")));
		expect(titles(layout.tiles)).toEqual(["A", "B", "C"]);
		expect(titles(layout.alsoNew)).toEqual(["D"]);
	});

	it("tiles only the newest of several unseen releases", () => {
		const layout = whatsNewLayout([
			entry("New", "2026-11-15", true),
			entry("Old highlight", "2026-10-29", true),
			entry("Old", "2026-10-29"),
		]);
		expect(titles(layout.tiles)).toEqual(["New"]);
		expect(titles(layout.alsoNew)).toEqual(["Old highlight", "Old"]);
	});

	it("is empty with no entries", () => {
		expect(whatsNewLayout([])).toEqual({ tiles: [], alsoNew: [], newestDate: null });
	});
});
