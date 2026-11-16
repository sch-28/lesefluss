import type { SyncSmartShelf } from "@lesefluss/core";
import { type SQL, sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { syncSmartShelves } from "~/db/schema";

const CHUNK = 1000;

/**
 * Last-write-wins per shelf, stamps stored as sent, as for collections. A client
 * from before shelf views omits `view`; its rows leave the stored view alone.
 */
export async function upsertSyncSmartShelves(
	exec: DbExecutor,
	userId: string,
	shelves: SyncSmartShelf[],
): Promise<void> {
	const byId = new Map<string, SyncSmartShelf>();
	for (const shelf of shelves) {
		const seen = byId.get(shelf.shelfId);
		if (!seen || shelf.updatedAt > seen.updatedAt) byId.set(shelf.shelfId, shelf);
	}
	const unique = [...byId.values()];
	const withView = unique.filter((s) => s.view !== undefined);
	const withoutView = unique.filter((s) => s.view === undefined);
	for (let i = 0; i < withView.length; i += CHUNK) {
		await upsertShelfRows(exec, userId, withView.slice(i, i + CHUNK), {
			view: sql`excluded.view`,
		});
	}
	for (let i = 0; i < withoutView.length; i += CHUNK) {
		await upsertShelfRows(exec, userId, withoutView.slice(i, i + CHUNK), {});
	}
}

async function upsertShelfRows(
	exec: DbExecutor,
	userId: string,
	rows: SyncSmartShelf[],
	optional: Record<string, SQL>,
): Promise<void> {
	await exec
		.insert(syncSmartShelves)
		.values(
			rows.map((s) => ({
				userId,
				shelfId: s.shelfId,
				name: s.name,
				conditions: s.conditions,
				pinned: s.pinned,
				sortOrder: s.sortOrder,
				view: s.view,
				deleted: s.deleted,
				createdAt: new Date(s.createdAt),
				updatedAt: new Date(s.updatedAt),
			})),
		)
		.onConflictDoUpdate({
			target: [syncSmartShelves.userId, syncSmartShelves.shelfId],
			set: {
				name: sql`excluded.name`,
				conditions: sql`excluded.conditions`,
				pinned: sql`excluded.pinned`,
				sortOrder: sql`excluded.sort_order`,
				...optional,
				deleted: sql`excluded.deleted`,
				createdAt: sql`excluded.created_at`,
				updatedAt: sql`excluded.updated_at`,
			},
			setWhere: sql`excluded.updated_at > sync_smart_shelves.updated_at`,
		});
}
