import {
	isWishlistCoverUrl,
	WISHLIST_AUTHOR_MAX,
	WISHLIST_TITLE_MAX,
	type WishlistKind,
} from "@lesefluss/core";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomSessionId } from "../../../utils/random-id";
import { normalizeSeriesUrl } from "../../serial-scrapers/utils/series-url";
import { serverNow } from "../../sync/server-clock";
import { db } from "../index";
import { type WishlistItem, wishlist } from "../schema";

// 9 bound columns per row stays well under SQLite's 999 parameters.
const CHUNK_SIZE = 100;

export type WishlistInput = {
	kind: WishlistKind;
	ref: string;
	title: string;
	author?: string | null;
	coverUrl?: string | null;
};

/** One title, however its ref is spelled: a series URL with or without `www.` or a trailing slash. */
export function wishlistKey(kind: WishlistKind, ref: string): string {
	return kind === "serial" ? `serial:${normalizeSeriesUrl(ref)}` : `catalog:${ref}`;
}

/** Only a short http(s) link: a data URL would bloat every push and fail the sync schema. */
function pushableCoverUrl(url: string | null | undefined): string | null {
	return url && isWishlistCoverUrl(url) ? url : null;
}

async function liveRowsFor(kind: WishlistKind, ref: string): Promise<WishlistItem[]> {
	const live = and(eq(wishlist.kind, kind), eq(wishlist.deleted, false));
	if (kind === "catalog") {
		return db
			.select()
			.from(wishlist)
			.where(and(live, eq(wishlist.ref, ref)));
	}
	const key = wishlistKey(kind, ref);
	const rows = await db.select().from(wishlist).where(live);
	return rows.filter((row) => wishlistKey(row.kind, row.ref) === key);
}

/**
 * Live items, newest first. Two devices that saved the same title offline each
 * hold a row; the list shows it once.
 */
export async function getWishlist(): Promise<WishlistItem[]> {
	const rows = await db
		.select()
		.from(wishlist)
		.where(eq(wishlist.deleted, false))
		.orderBy(desc(wishlist.createdAt), desc(wishlist.id));
	const seen = new Set<string>();
	return rows.filter((row) => {
		const key = wishlistKey(row.kind, row.ref);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** Returns the existing item when the title is already on the wishlist. */
export async function addToWishlist(
	input: WishlistInput,
	now = serverNow(),
): Promise<WishlistItem> {
	const [existing] = await liveRowsFor(input.kind, input.ref);
	if (existing) return existing;
	const row: WishlistItem = {
		id: randomSessionId(),
		kind: input.kind,
		ref: input.ref,
		title: input.title.trim().slice(0, WISHLIST_TITLE_MAX),
		author: input.author?.trim().slice(0, WISHLIST_AUTHOR_MAX) || null,
		coverUrl: pushableCoverUrl(input.coverUrl),
		deleted: false,
		createdAt: now,
		updatedAt: now,
	};
	await db.insert(wishlist).values(row);
	return row;
}

/** Tombstones every row for the title, so the removal syncs. Returns whether one was live. */
export async function removeFromWishlist(
	kind: WishlistKind,
	ref: string,
	now = serverNow(),
): Promise<boolean> {
	const ids = (await liveRowsFor(kind, ref)).map((row) => row.id);
	for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
		await db
			.update(wishlist)
			.set({ deleted: true, updatedAt: now })
			.where(inArray(wishlist.id, ids.slice(i, i + CHUNK_SIZE)));
	}
	return ids.length > 0;
}

export async function deleteAllWishlist(now = serverNow()): Promise<void> {
	await db
		.update(wishlist)
		.set({ deleted: true, updatedAt: now })
		.where(eq(wishlist.deleted, false));
}

/** Tombstones included: a push always resends them so deletes reach the server. */
export async function getAllWishlistForSync(): Promise<WishlistItem[]> {
	return db.select().from(wishlist);
}

/** Last-write-wins on `updatedAt`. */
export async function upsertWishlist(rows: WishlistItem[]): Promise<void> {
	for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
		await db
			.insert(wishlist)
			.values(rows.slice(i, i + CHUNK_SIZE))
			.onConflictDoUpdate({
				target: wishlist.id,
				set: {
					kind: sql`excluded.kind`,
					ref: sql`excluded.ref`,
					title: sql`excluded.title`,
					author: sql`excluded.author`,
					coverUrl: sql`excluded.cover_url`,
					deleted: sql`excluded.deleted`,
					createdAt: sql`excluded.created_at`,
					updatedAt: sql`excluded.updated_at`,
				},
				where: sql`${wishlist.updatedAt} < excluded.updated_at`,
			});
	}
}

export async function hardDeleteWishlist(ids: string[]): Promise<void> {
	for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
		await db.delete(wishlist).where(inArray(wishlist.id, ids.slice(i, i + CHUNK_SIZE)));
	}
}
