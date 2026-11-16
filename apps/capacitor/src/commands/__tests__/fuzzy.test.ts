import { describe, expect, it } from "vitest";
import { fuzzyScore } from "../fuzzy";
import { paletteGroups } from "../palette-results";
import type { Command } from "../registry";

const noop = () => {};

describe("fuzzyScore", () => {
	it("needs the query as a subsequence", () => {
		expect(fuzzyScore("imp", "Import a book")).not.toBeNull();
		expect(fuzzyScore("ibk", "Import a book")).not.toBeNull();
		expect(fuzzyScore("xyz", "Import a book")).toBeNull();
	});

	it("ranks a prefix above a word start above a match inside a word", () => {
		const prefix = fuzzyScore("set", "Settings") ?? 0;
		const wordStart = fuzzyScore("set", "Open settings") ?? 0;
		const midWord = fuzzyScore("set", "Reset theme") ?? 0;
		expect(prefix).toBeGreaterThan(wordStart);
		expect(wordStart).toBeGreaterThan(midWord);
	});
});

describe("paletteGroups", () => {
	const commands: Command[] = [
		{ id: "g", title: "Import a book", scope: "global", keys: ["Mod+O"], run: noop },
		{ id: "r", title: "Read with RSVP", scope: "reader", keys: ["r"], run: noop },
		{ id: "h", title: "Clear selection", scope: "reader", isHiddenInPalette: true, run: noop },
		{ id: "c", title: "Go to: Chapter One", scope: "reader", isSearchOnly: true, run: noop },
		{ id: "s", title: "Play or pause", scope: "rsvp", run: noop },
		{ id: "p", title: "Next page", scope: "page", run: noop },
		{ id: "l", title: "Import from a link", scope: "library", run: noop },
	];

	it("groups by the shared scope labels, reader first", () => {
		const groups = paletteGroups(commands, "");
		expect(groups.map((g) => g.label)).toEqual([
			"Reader",
			"RSVP",
			"Page and scroll",
			"Library",
			"Everywhere",
		]);
		expect(groups[0]?.commands.map((c) => c.id)).toEqual(["r"]);
	});

	it("lists search-only commands once the user types, never hidden ones", () => {
		const ids = paletteGroups(commands, "ch").flatMap((g) => g.commands.map((c) => c.id));
		expect(ids).toContain("c");
		expect(paletteGroups(commands, "clear")).toEqual([]);
	});

	it("filters and keeps the best match first within a group", () => {
		const groups = paletteGroups(commands, "imp");
		expect(groups.map((g) => g.label)).toEqual(["Library", "Everywhere"]);
	});
});
