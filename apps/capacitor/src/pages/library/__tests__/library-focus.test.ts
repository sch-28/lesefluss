import { describe, expect, it } from "vitest";
import { makeBook } from "../../../test/book-fixture";
import { groupLibrary, layoutRows } from "../group-by";
import { escapeStep, focusRows, moveFocus, rowTokens } from "../library-focus";
import { buildLibraryItems } from "../sort-filter";

// A 3-column grid: a short last row.
const grid = [
	["a", "b", "c"],
	["d", "e", "f"],
	["g", "h"],
];

describe("moveFocus", () => {
	it("lands on the first item from no focus, or a focus the view lost", () => {
		for (const move of ["next", "prev", "up", "down"] as const) {
			expect(moveFocus(grid, null, move)).toBe("a");
			expect(moveFocus(grid, "gone", move)).toBe("a");
		}
		expect(moveFocus([], null, "next")).toBeNull();
	});

	it("steps through the visible order across rows with next and prev", () => {
		expect(moveFocus(grid, "c", "next")).toBe("d");
		expect(moveFocus(grid, "d", "prev")).toBe("c");
	});

	it("stays put at either end", () => {
		expect(moveFocus(grid, "h", "next")).toBe("h");
		expect(moveFocus(grid, "a", "prev")).toBe("a");
		expect(moveFocus(grid, "b", "up")).toBe("b");
		expect(moveFocus(grid, "g", "down")).toBe("g");
	});

	it("keeps the column up and down, or takes a shorter row's last item", () => {
		expect(moveFocus(grid, "b", "down")).toBe("e");
		expect(moveFocus(grid, "h", "up")).toBe("e");
		expect(moveFocus(grid, "f", "down")).toBe("h");
	});

	it("moves one item per row in a list", () => {
		const list = [["a"], ["b"], ["c"]];
		expect(moveFocus(list, "a", "down")).toBe("b");
		expect(moveFocus(list, "b", "next")).toBe("c");
	});
});

describe("focusRows", () => {
	const ann = makeBook({ id: "ann1", title: "A1", author: "Ann" });
	const ann2 = makeBook({ id: "ann2", title: "A2", author: "Ann" });
	const bob = makeBook({ id: "bob1", title: "B1", author: "Bob" });
	const items = buildLibraryItems([ann, ann2, bob], [], new Map(), 0);
	const groups = groupLibrary(items, "author", { collections: [], seriesMemberships: new Map() });

	it("leaves group headings out, so a move crosses into the next group", () => {
		const rows = focusRows(layoutRows(items, groups, 3, new Set()));
		expect(rows.flat()).toHaveLength(3);
		const last = rows[0]?.at(-1) ?? null;
		expect(moveFocus(rows, last, "next")).toBe(rows[1]?.[0]);
		expect(moveFocus(rows, last, "down")).toBe(rows[1]?.[0]);
	});

	it("skips a collapsed group's books", () => {
		const firstGroup = groups?.[0];
		const rows = focusRows(layoutRows(items, groups, 3, new Set([firstGroup?.key ?? ""])));
		expect(rows.flat()).toHaveLength(3 - (firstGroup?.items.length ?? 0));
	});
});

describe("a book shown in several groups", () => {
	const both = makeBook({ id: "both", title: "Both", tags: '["a","b"]' });
	const onlyB = makeBook({ id: "onlyb", title: "Only B", tags: '["b"]' });
	const items = buildLibraryItems([both, onlyB], [], new Map(), 0);
	const groups = groupLibrary(items, "tag", { collections: [], seriesMemberships: new Map() });
	const layout = layoutRows(items, groups, 1, new Set());

	it("gets a focus of its own in each group, so moves reach every copy", () => {
		const rows = focusRows(layout);
		const flat = rows.flat();
		expect(flat).toHaveLength(3);
		expect(new Set(flat).size).toBe(3);
		let focus: string | null = null;
		const visited: string[] = [];
		for (let i = 0; i < 3; i++) {
			focus = moveFocus(rows, focus, i === 0 ? "down" : "next");
			if (focus) visited.push(focus);
		}
		expect(visited).toEqual(flat);
	});

	it("keeps headings as gaps so tokens line up with the rendered rows", () => {
		const tokens = rowTokens(layout);
		expect(tokens).toHaveLength(layout.length);
		layout.forEach((row, index) => {
			expect(tokens[index] === null).toBe(row.type === "header");
		});
	});
});

describe("escapeStep", () => {
	it("clears search, then selection, then focus, one per press", () => {
		const all = { isSearchActive: true, isSelecting: true, hasFocus: true };
		expect(escapeStep(all)).toBe("search");
		expect(escapeStep({ ...all, isSearchActive: false })).toBe("selection");
		expect(escapeStep({ isSearchActive: false, isSelecting: false, hasFocus: true })).toBe("focus");
		expect(escapeStep({ isSearchActive: false, isSelecting: false, hasFocus: false })).toBeNull();
	});
});
