import { describe, expect, it } from "vitest";
import { DESTINATIONS_LABEL, paletteGroups } from "../palette-results";
import type { Command } from "../registry";

const noop = () => {};
const COMMANDS: Command[] = [
	{ id: "library.next", title: "Next book", scope: "library", keys: ["j"], run: noop },
	{ id: "library.rate-1", title: "Rate 1 star", scope: "library", keys: ["1"], run: noop },
	{ id: "global.import", title: "Add book", scope: "global", keys: ["Mod+O"], run: noop },
	{
		id: "global.continue",
		title: "Continue Dune",
		scope: "global",
		isDestination: true,
		run: noop,
	},
	{
		id: "global.stats",
		title: "Go to reading stats",
		scope: "global",
		isDestination: true,
		run: noop,
	},
	{
		id: "global.settings",
		title: "Open settings",
		scope: "global",
		isDestination: true,
		run: noop,
	},
];

describe("paletteGroups", () => {
	it("leads the empty palette with Continue reading and the main destinations", () => {
		const groups = paletteGroups(COMMANDS, "");
		expect(groups[0]).toEqual({
			label: DESTINATIONS_LABEL,
			commands: [COMMANDS[3], COMMANDS[4], COMMANDS[5]],
		});
		expect(groups.map((g) => g.label)).toEqual([DESTINATIONS_LABEL, "Library", "Everywhere"]);
	});

	it("ranks destinations with the rest of their scope once the user types", () => {
		const groups = paletteGroups(COMMANDS, "settings");
		expect(groups.map((g) => g.label)).toEqual(["Everywhere"]);
		expect(groups[0].commands[0].id).toBe("global.settings");
	});
});

describe("withKey", () => {
	it("names the action and its key", async () => {
		const { withKey } = await import("../keys");
		expect(withKey("Search library", "/", false)).toBe("Search library (/)");
		expect(withKey("Command palette", "Mod+K", false)).toBe("Command palette (Ctrl+K)");
		expect(withKey("Command palette", "Mod+K", true)).toBe("Command palette (⌘+K)");
		expect(withKey("Filter", undefined)).toBe("Filter");
	});
});
