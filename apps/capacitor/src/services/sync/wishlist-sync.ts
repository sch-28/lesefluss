import { type SyncWishlistItem, SyncWishlistItemSchema, WISHLIST_PUSH_MAX } from "@lesefluss/core";
import type { WishlistItem } from "../db/schema";

export function wishlistItemToSync(item: WishlistItem): SyncWishlistItem {
	return {
		itemId: item.id,
		kind: item.kind,
		ref: item.ref,
		title: item.title,
		author: item.author,
		coverUrl: item.coverUrl,
		deleted: item.deleted,
		createdAt: item.createdAt,
		updatedAt: item.updatedAt,
	};
}

/**
 * The bookmark rules: a server tombstone removes the local row whatever its
 * stamp, a local tombstone wins over a live server row until it is pushed, and
 * live rows go newest-wins.
 */
export function buildWishlistMerge(
	local: WishlistItem[],
	server: unknown[],
): { upserts: WishlistItem[]; deletes: string[]; rejected: number } {
	const localById = new Map(local.map((item) => [item.id, item]));
	const upserts: WishlistItem[] = [];
	const deletes: string[] = [];
	let rejected = 0;
	for (const raw of server) {
		const parsed = SyncWishlistItemSchema.safeParse(raw);
		if (!parsed.success) {
			rejected++;
			continue;
		}
		const item = parsed.data;
		const mine = localById.get(item.itemId);
		if (item.deleted) {
			if (mine) deletes.push(item.itemId);
			continue;
		}
		if (mine && (mine.deleted || item.updatedAt <= mine.updatedAt)) continue;
		upserts.push({
			id: item.itemId,
			kind: item.kind,
			ref: item.ref,
			title: item.title,
			author: item.author,
			coverUrl: item.coverUrl,
			deleted: false,
			createdAt: item.createdAt,
			updatedAt: item.updatedAt,
		});
	}
	return { upserts, deletes, rejected };
}

/** Tombstones included. Invalid rows stay local: one would 400 the whole push. */
export function pushableWishlist(local: WishlistItem[]) {
	const rows = local.map(wishlistItemToSync);
	const valid = rows.filter((row) => SyncWishlistItemSchema.safeParse(row).success);
	const wishlist =
		valid.length > WISHLIST_PUSH_MAX
			? [...valid].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, WISHLIST_PUSH_MAX)
			: valid;
	return { wishlist, rejected: rows.length - valid.length };
}
