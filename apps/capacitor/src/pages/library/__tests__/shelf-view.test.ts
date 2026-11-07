import { SyncCollectionSchema } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import { type LibraryLayout, parseShelfView, resolveLayout, writeShelfView } from "../shelf-view";

const device: LibraryLayout = { groupBy: "none", columns: ["title", "author", "rating"] };

describe("shelf view", () => {
	it("uses the device layout for a shelf without a view, or one it cannot read", () => {
		expect(resolveLayout(null, device)).toEqual(device);
		expect(resolveLayout("{broken", device)).toEqual(device);
		expect(resolveLayout("[1,2]", device)).toEqual(device);
	});

	it("takes the shelf's group-by and columns, each falling back on its own", () => {
		expect(resolveLayout('{"v":1,"groupBy":"author"}', device)).toEqual({
			groupBy: "author",
			columns: device.columns,
		});
		expect(
			resolveLayout('{"v":1,"groupBy":"shelfmark","columns":["words","title"]}', device),
		).toEqual({ groupBy: "none", columns: ["title", "words"] });
	});

	it("snapshots the shown layout on the first change, so another device opens it the same", () => {
		const view = writeShelfView(null, device, { groupBy: "tag" });
		expect(parseShelfView(view)).toEqual({ v: 1, groupBy: "tag", columns: device.columns });
		expect(resolveLayout(view, { groupBy: "status", columns: ["title"] })).toEqual({
			groupBy: "tag",
			columns: device.columns,
		});
	});

	it("keeps column ids and keys from a newer version through a change", () => {
		const stored =
			'{"v":1,"groupBy":"author","columns":["title","pages","rating"],"density":"compact"}';
		const shown = resolveLayout(stored, device);
		expect(shown.columns).toEqual(["title", "rating"]);
		const next = writeShelfView(stored, shown, { columns: ["title", "rating", "words"] });
		expect(parseShelfView(next)).toEqual({
			v: 1,
			groupBy: "author",
			columns: ["title", "rating", "words", "pages"],
			density: "compact",
		});
	});

	it("writes a view the sync schema accepts", () => {
		const view = writeShelfView(null, device, { columns: ["title", "words"] });
		const row = {
			collectionId: "c1",
			name: "Shelf",
			sortOrder: 1,
			view,
			deleted: false,
			createdAt: 1,
			updatedAt: 1,
		};
		expect(SyncCollectionSchema.safeParse(row).success).toBe(true);
	});
});
