import { SMART_SHELF_NAME_MAX } from "@lesefluss/core";
import { asc, eq, sql } from "drizzle-orm";
import { randomHexId } from "../../../utils/random-id";
import { serverNow } from "../../sync/server-clock";
import { db } from "../index";
import { type SmartShelf, smartShelves } from "../schema";

// 8 bound columns per row stays well under SQLite's 999 parameters.
const CHUNK_SIZE = 100;

export function normalizeShelfName(name: string): string {
	return name.trim().slice(0, SMART_SHELF_NAME_MAX);
}

export async function getSmartShelves(): Promise<SmartShelf[]> {
	return db
		.select()
		.from(smartShelves)
		.where(eq(smartShelves.deleted, false))
		.orderBy(asc(smartShelves.sortOrder), asc(smartShelves.createdAt), asc(smartShelves.id));
}

export async function createSmartShelf(
	input: { name: string; conditions: string; pinned: boolean },
	now = serverNow(),
): Promise<SmartShelf> {
	const name = normalizeShelfName(input.name);
	if (!name) throw new Error("Shelf name is empty");
	const [last] = await db
		.select({ sortOrder: smartShelves.sortOrder })
		.from(smartShelves)
		.where(eq(smartShelves.deleted, false))
		.orderBy(sql`${smartShelves.sortOrder} DESC`)
		.limit(1);
	const row: SmartShelf = {
		id: randomHexId(),
		name,
		conditions: input.conditions,
		pinned: input.pinned,
		sortOrder: (last?.sortOrder ?? 0) + 1,
		deleted: false,
		createdAt: now,
		updatedAt: now,
	};
	await db.insert(smartShelves).values(row);
	return row;
}

export async function updateSmartShelf(
	id: string,
	patch: { name?: string; conditions?: string; pinned?: boolean },
	now = serverNow(),
): Promise<void> {
	const next: Partial<SmartShelf> = { updatedAt: now };
	if (patch.name !== undefined) {
		const name = normalizeShelfName(patch.name);
		if (!name) throw new Error("Shelf name is empty");
		next.name = name;
	}
	if (patch.conditions !== undefined) next.conditions = patch.conditions;
	if (patch.pinned !== undefined) next.pinned = patch.pinned;
	await db.update(smartShelves).set(next).where(eq(smartShelves.id, id));
}

export async function deleteSmartShelf(id: string, now = serverNow()): Promise<void> {
	await db
		.update(smartShelves)
		.set({ deleted: true, updatedAt: now })
		.where(eq(smartShelves.id, id));
}

/** Tombstones included: a push always resends them so deletes reach the server. */
export async function getAllSmartShelvesForSync(): Promise<SmartShelf[]> {
	return db.select().from(smartShelves);
}

export async function upsertSmartShelves(rows: SmartShelf[]): Promise<void> {
	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		await db
			.insert(smartShelves)
			.values(rows.slice(i, i + CHUNK_SIZE))
			.onConflictDoUpdate({
				target: smartShelves.id,
				set: {
					name: sql`excluded.name`,
					conditions: sql`excluded.conditions`,
					pinned: sql`excluded.pinned`,
					sortOrder: sql`excluded.sort_order`,
					deleted: sql`excluded.deleted`,
					createdAt: sql`excluded.created_at`,
					updatedAt: sql`excluded.updated_at`,
				},
				where: sql`${smartShelves.updatedAt} < excluded.updated_at`,
			});
	}
}
