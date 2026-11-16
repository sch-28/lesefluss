import {
	BOOKMARKS_PUSH_MAX,
	type SyncBookmark,
	SyncBookmarkSchema,
	wordPos,
} from "@lesefluss/core";
import type { Bookmark } from "../db/schema";

export function bookmarkToSync(b: Bookmark): SyncBookmark {
	return {
		bookmarkId: b.id,
		bookId: b.bookId,
		word: b.word,
		label: b.label,
		deleted: b.deleted,
		createdAt: b.createdAt,
		updatedAt: b.updatedAt,
	};
}

/**
 * A server tombstone removes the local row whatever its stamp: the server never
 * revives a deleted bookmark, so a newer local edit could never land anyway. A
 * local tombstone wins over a live server row until it is pushed. Live rows go
 * newest-wins, and those for books this device does not hold are skipped.
 */
export function buildBookmarkMerge(
	local: Bookmark[],
	server: unknown[],
	liveBookIds: ReadonlySet<string>,
): { upserts: Bookmark[]; deletes: string[]; rejected: number } {
	const localById = new Map(local.map((b) => [b.id, b]));
	const upserts: Bookmark[] = [];
	const deletes: string[] = [];
	let rejected = 0;
	for (const raw of server) {
		const parsed = SyncBookmarkSchema.safeParse(raw);
		if (!parsed.success) {
			rejected++;
			continue;
		}
		const b = parsed.data;
		const mine = localById.get(b.bookmarkId);
		if (b.deleted) {
			if (mine) deletes.push(b.bookmarkId);
			continue;
		}
		if (mine && (mine.deleted || b.updatedAt <= mine.updatedAt)) continue;
		if (!liveBookIds.has(b.bookId)) continue;
		upserts.push({
			id: b.bookmarkId,
			bookId: b.bookId,
			word: wordPos(b.word),
			label: b.label,
			deleted: false,
			createdAt: b.createdAt,
			updatedAt: b.updatedAt,
		});
	}
	return { upserts, deletes, rejected };
}

/** Tombstones included, for the books this push carries. Invalid rows stay local: one would 400 the whole push. */
export function pushableBookmarks(local: Bookmark[], pushedBookIds: ReadonlySet<string>) {
	const rows = local.filter((b) => pushedBookIds.has(b.bookId)).map(bookmarkToSync);
	const valid = rows.filter((row) => SyncBookmarkSchema.safeParse(row).success);
	const bookmarks =
		valid.length > BOOKMARKS_PUSH_MAX
			? [...valid].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, BOOKMARKS_PUSH_MAX)
			: valid;
	return { bookmarks, rejected: rows.length - valid.length };
}
