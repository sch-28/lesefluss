import { describe, expect, it, vi } from "vitest";
import type { Command } from "../registry";
import { shortcutGroups } from "../shortcut-groups";

const cmd = (id: string, scope: Command["scope"], keys?: string[], extra: Partial<Command> = {}) =>
	({ id, title: id, scope, keys, run: vi.fn(), ...extra }) as Command;

describe("shortcutGroups", () => {
	it("puts the current mode's group first and reader-only keys under Reader", () => {
		const groups = shortcutGroups([
			cmd("global.shortcuts", "global", ["?"]),
			cmd("reader.fullscreen", "reader", ["f"]),
			cmd("listen.toggle", "listen", ["l"]),
			cmd("rsvp.play", "rsvp", ["Space"]),
		]);
		expect(groups.map((g) => g.label)).toEqual(["RSVP", "Reader", "Listen", "Everywhere"]);
		const everywhere = groups.find((g) => g.label === "Everywhere");
		expect(everywhere?.rows.map((r) => r.id)).toEqual(["global.shortcuts"]);
	});

	it("leads with Library in the library", () => {
		const groups = shortcutGroups([
			cmd("global.palette", "global", ["Mod+K"]),
			cmd("library.select-all", "library", ["Mod+A"]),
		]);
		expect(groups.map((g) => g.label)).toEqual(["Library", "Everywhere"]);
	});

	it("lists a command registered later without any edit to the sheet", () => {
		const groups = shortcutGroups([cmd("test.extra", "listen", ["x"])]);
		expect(groups).toEqual([
			{ label: "Listen", rows: [{ id: "test.extra", title: "test.extra", keys: ["x"] }] },
		]);
	});

	it("skips commands without keys and merges page and scroll into one group", () => {
		const groups = shortcutGroups([
			cmd("reader.search", "reader"),
			cmd("page.next", "page", ["ArrowRight"]),
			cmd("scroll.down", "scroll", ["ArrowDown"]),
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0].label).toBe("Page and scroll");
		expect(groups[0].rows.map((r) => r.id)).toEqual(["page.next", "scroll.down"]);
	});

	it("lists a key bound twice only under the command the dispatcher runs", () => {
		const groups = shortcutGroups([
			cmd("reader.dismiss-selection", "reader", ["Escape"]),
			cmd("rsvp.exit", "rsvp", ["Escape"]),
			cmd("late.claim", "reader", ["Mod+K", "k"]),
			cmd("global.palette", "global", ["Mod+K"], { claimsKeys: true }),
		]);
		const ids = groups.flatMap((g) => g.rows.map((r) => `${r.id}:${r.keys.join(",")}`));
		expect(ids).toEqual([
			"reader.dismiss-selection:Escape",
			"late.claim:k",
			"global.palette:Mod+K",
		]);
	});
});
