import { SMART_SHELVES_PUSH_MAX, SyncPayloadSchema } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { SmartShelf } from "../../db/schema";
import { buildSmartShelfMerge, pushableSmartShelves, smartShelfToSync } from "../smart-shelf-sync";

function shelf(overrides: Partial<SmartShelf> = {}): SmartShelf {
	return {
		id: "s1",
		name: "Short reads",
		conditions: '{"v":1,"root":{"op":"and","items":[]}}',
		pinned: true,
		sortOrder: 1,
		deleted: false,
		createdAt: 1_000,
		updatedAt: 1_000,
		...overrides,
	};
}

describe("smart shelf sync", () => {
	it("a payload without shelves parses and leaves them out", () => {
		const parsed = SyncPayloadSchema.parse({ books: [], settings: null, highlights: [] });
		expect(parsed.smartShelves).toBeUndefined();
	});

	it("a pushed shelf validates and merges back into an empty device unchanged", () => {
		const pushed = pushableSmartShelves([shelf()]);
		const payload = SyncPayloadSchema.parse({
			books: [],
			settings: null,
			highlights: [],
			smartShelves: pushed.shelves,
		});
		expect(buildSmartShelfMerge([], payload.smartShelves ?? []).shelves).toEqual([shelf()]);
	});

	it("only a newer server row wins, tombstones included", () => {
		const local = [shelf({ updatedAt: 2_000 })];
		const older = smartShelfToSync(shelf({ name: "Old", updatedAt: 1_500 }));
		const deleted = smartShelfToSync(shelf({ deleted: true, updatedAt: 3_000 }));
		expect(buildSmartShelfMerge(local, [older]).shelves).toEqual([]);
		expect(buildSmartShelfMerge(local, [deleted]).shelves).toEqual([
			shelf({ deleted: true, updatedAt: 3_000 }),
		]);
	});

	it("skips malformed rows on pull and drops them from the push", () => {
		const merge = buildSmartShelfMerge([], [{ shelfId: "x" }, smartShelfToSync(shelf())]);
		expect(merge.rejected).toBe(1);
		expect(merge.shelves).toHaveLength(1);
		const push = pushableSmartShelves([shelf({ name: "" }), shelf({ id: "s2" })]);
		expect(push.rejected).toBe(1);
		expect(push.shelves.map((s) => s.shelfId)).toEqual(["s2"]);
	});

	it("caps the push at the newest rows", () => {
		const many = Array.from({ length: SMART_SHELVES_PUSH_MAX + 3 }, (_, i) =>
			shelf({ id: `s${i}`, updatedAt: i }),
		);
		const push = pushableSmartShelves(many);
		expect(push.shelves).toHaveLength(SMART_SHELVES_PUSH_MAX);
		expect(push.shelves.some((s) => s.shelfId === "s0")).toBe(false);
	});
});
