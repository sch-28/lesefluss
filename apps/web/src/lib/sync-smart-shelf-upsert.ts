import type { SyncSmartShelf } from "@lesefluss/core";
import { sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { syncSmartShelves } from "~/db/schema";

const CHUNK = 1000;

/** Last-write-wins per shelf, stamps stored as sent, as for collections. */
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
	for (let i = 0; i < unique.length; i += CHUNK) {
		await exec
			.insert(syncSmartShelves)
			.values(
				unique.slice(i, i + CHUNK).map((s) => ({
					userId,
					shelfId: s.shelfId,
					name: s.name,
					conditions: s.conditions,
					pinned: s.pinned,
					sortOrder: s.sortOrder,
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
					deleted: sql`excluded.deleted`,
					createdAt: sql`excluded.created_at`,
					updatedAt: sql`excluded.updated_at`,
				},
				setWhere: sql`excluded.updated_at > sync_smart_shelves.updated_at`,
			});
	}
}
