import type { SyncWishlistItem } from "@lesefluss/core";
import { sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { type NewSyncWishlistItem, syncWishlist } from "~/db/schema";

// 10 bound columns per row stays far under Postgres' 65535 parameters.
const CHUNK_SIZE = 1000;

/**
 * Last-write-wins upsert of pushed wishlist items, with the bookmark rules: a
 * tombstone is final, and an item is never tombstoned for being absent from a
 * push. Not clamped to server time, for the reason given at `goalInsertValues`.
 */
export async function upsertSyncWishlist(
	exec: DbExecutor,
	userId: string,
	items: SyncWishlistItem[],
): Promise<void> {
	const byId = new Map<string, SyncWishlistItem>();
	for (const item of items) {
		const seen = byId.get(item.itemId);
		if (!seen || item.deleted || (!seen.deleted && item.updatedAt > seen.updatedAt)) {
			byId.set(item.itemId, item);
		}
	}
	const rows = [...byId.values()].map((item) => wishlistInsertValues(userId, item));
	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		await exec
			.insert(syncWishlist)
			.values(rows.slice(i, i + CHUNK_SIZE))
			.onConflictDoUpdate({
				target: [syncWishlist.userId, syncWishlist.itemId],
				set: {
					kind: sql`excluded.kind`,
					ref: sql`excluded.ref`,
					title: sql`excluded.title`,
					author: sql`excluded.author`,
					coverUrl: sql`excluded.cover_url`,
					deleted: sql`excluded.deleted`,
					createdAt: sql`excluded.created_at`,
					updatedAt: sql`GREATEST(excluded.updated_at, sync_wishlist.updated_at)`,
				},
				setWhere: sql`sync_wishlist.deleted = false AND (excluded.deleted OR excluded.updated_at > sync_wishlist.updated_at)`,
			});
	}
}

function wishlistInsertValues(userId: string, item: SyncWishlistItem): NewSyncWishlistItem {
	return {
		userId,
		itemId: item.itemId,
		kind: item.kind,
		ref: item.ref,
		title: item.title,
		author: item.author,
		coverUrl: item.coverUrl,
		deleted: item.deleted,
		createdAt: new Date(item.createdAt),
		updatedAt: new Date(item.updatedAt),
	};
}
