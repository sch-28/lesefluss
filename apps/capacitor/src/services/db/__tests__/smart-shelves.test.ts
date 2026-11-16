// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "./test-db";

const { db, raw, close } = createTestDb();
vi.mock("../index", () => ({
	get db() {
		return db;
	},
}));
afterAll(close);

const shelves = await import("../queries/smart-shelves");

const CONDITIONS = '{"v":1,"root":{"op":"and","items":[]}}';

beforeEach(() => {
	raw.exec("DELETE FROM smart_shelves;");
});

describe("smart shelf queries", () => {
	it("creates shelves in order and reads them back", async () => {
		const a = await shelves.createSmartShelf(
			{ name: "  Short  ", conditions: CONDITIONS, pinned: true },
			10,
		);
		const b = await shelves.createSmartShelf(
			{ name: "Long", conditions: CONDITIONS, pinned: false },
			20,
		);
		expect(a.sortOrder).toBe(1);
		expect(b.sortOrder).toBe(2);
		expect(await shelves.getSmartShelves()).toEqual([{ ...a, name: "Short" }, { ...b }]);
	});

	it("refuses an empty name", async () => {
		await expect(
			shelves.createSmartShelf({ name: "   ", conditions: CONDITIONS, pinned: false }),
		).rejects.toThrow();
		const a = await shelves.createSmartShelf(
			{ name: "A", conditions: CONDITIONS, pinned: false },
			10,
		);
		await expect(shelves.updateSmartShelf(a.id, { name: " " }, 20)).rejects.toThrow();
		expect((await shelves.getSmartShelves())[0]).toMatchObject({ name: "A", updatedAt: 10 });
	});

	it("stamps every change so it wins on the other devices", async () => {
		const a = await shelves.createSmartShelf(
			{ name: "A", conditions: CONDITIONS, pinned: false },
			10,
		);
		await shelves.updateSmartShelf(a.id, { pinned: true }, 20);
		expect((await shelves.getSmartShelves())[0]).toMatchObject({ pinned: true, updatedAt: 20 });
		await shelves.updateSmartShelf(a.id, { name: "B" }, 30);
		expect((await shelves.getSmartShelves())[0]).toMatchObject({ name: "B", updatedAt: 30 });
		await shelves.deleteSmartShelf(a.id, 40);
		expect(await shelves.getSmartShelves()).toEqual([]);
		expect(await shelves.getAllSmartShelvesForSync()).toEqual([
			expect.objectContaining({ id: a.id, deleted: true, updatedAt: 40 }),
		]);
	});

	it("lands a pulled row only when it is newer", async () => {
		const a = await shelves.createSmartShelf(
			{ name: "Local", conditions: CONDITIONS, pinned: false },
			50,
		);
		await shelves.upsertSmartShelves([{ ...a, name: "Older", updatedAt: 40 }]);
		expect((await shelves.getSmartShelves())[0].name).toBe("Local");
		await shelves.upsertSmartShelves([{ ...a, name: "Newer", updatedAt: 60 }]);
		expect((await shelves.getSmartShelves())[0].name).toBe("Newer");
		await shelves.upsertSmartShelves([{ ...a, deleted: true, updatedAt: 70 }]);
		expect(await shelves.getSmartShelves()).toEqual([]);
	});
});
