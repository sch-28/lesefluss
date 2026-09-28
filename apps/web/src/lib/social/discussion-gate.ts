import { and, eq, max, sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { buddyReadMember, syncBooks, syncReadingSessions } from "~/db/schema";
import { hasBlockEitherWay, isSociallyVisible, loadSocialUsers } from "./relationship";

export type GatedAnchor = {
	authorId: string | null;
	anchorKind: "range" | "chapter";
	startWord: number;
	endWord: number;
};

export type GateViewer = { userId: string; furthestWord: number; showEverything: boolean };

/**
 * Whether the viewer has read far enough for an item. A passage unlocks once
 * its last word is behind the reader, a chapter comment once the chapter has
 * begun. The viewer's own items and the "show everything" override skip it.
 */
export function isUnlockedFor(viewer: GateViewer, item: GatedAnchor): boolean {
	if (item.authorId === viewer.userId || viewer.showEverything) return true;
	const unlockAt = item.anchorKind === "chapter" ? item.startWord : item.endWord;
	return unlockAt <= viewer.furthestWord;
}

/**
 * Raises the member's furthest position from what the server knows now: the
 * synced position and the furthest recorded session. Never lowers it, so a
 * jump back or a session wipe keeps what was unlocked. Null when the user is
 * not a current member.
 */
export async function refreshFurthestWord(
	exec: DbExecutor,
	buddyReadId: string,
	userId: string,
): Promise<GateViewer | null> {
	const [member] = await exec
		.select({
			bookId: buddyReadMember.bookId,
			furthestWord: buddyReadMember.furthestWord,
			showEverything: buddyReadMember.showEverything,
		})
		.from(buddyReadMember)
		.where(
			and(
				eq(buddyReadMember.buddyReadId, buddyReadId),
				eq(buddyReadMember.userId, userId),
				eq(buddyReadMember.state, "active"),
			),
		);
	if (!member) return null;
	const [position] = await exec
		.select({ wordPosition: syncBooks.wordPosition })
		.from(syncBooks)
		.where(
			and(
				eq(syncBooks.userId, userId),
				eq(syncBooks.bookId, member.bookId),
				eq(syncBooks.deleted, false),
			),
		);
	// A member whose linked book is gone counts as having left (see buddy-reads.ts).
	if (!position) return null;
	const [sessions] = await exec
		.select({ endWord: max(syncReadingSessions.endWord) })
		.from(syncReadingSessions)
		.where(
			and(eq(syncReadingSessions.userId, userId), eq(syncReadingSessions.bookId, member.bookId)),
		);
	const furthestWord = Math.max(member.furthestWord, position.wordPosition, sessions?.endWord ?? 0);
	if (furthestWord > member.furthestWord) {
		await exec
			.update(buddyReadMember)
			.set({ furthestWord: sql`GREATEST(${buddyReadMember.furthestWord}, ${furthestWord})` })
			.where(and(eq(buddyReadMember.buddyReadId, buddyReadId), eq(buddyReadMember.userId, userId)));
	}
	return { userId, furthestWord, showEverything: member.showEverything };
}

/** Matches the discussion list: an author who is banned, has no handle, or is in a block relation with the viewer is invisible. */
export async function canSeeAuthor(
	exec: DbExecutor,
	viewerId: string,
	authorId: string,
	now = new Date(),
): Promise<boolean> {
	if (authorId === viewerId) return true;
	const author = (await loadSocialUsers(exec, [authorId])).get(authorId);
	if (!author || !isSociallyVisible(author, now)) return false;
	return !(await hasBlockEitherWay(exec, viewerId, authorId));
}

/**
 * The single-item gate for anything outside the discussion list (push
 * previews, report checks): an active member who can see the author, and
 * read far enough. Uses only stored positions, never request input.
 */
export async function isVisibleToViewer(
	exec: DbExecutor,
	buddyReadId: string,
	viewerId: string,
	anchor: GatedAnchor,
	now = new Date(),
): Promise<boolean> {
	const viewer = await refreshFurthestWord(exec, buddyReadId, viewerId);
	if (!viewer) return false;
	if (anchor.authorId && !(await canSeeAuthor(exec, viewerId, anchor.authorId, now))) return false;
	return isUnlockedFor(viewer, anchor);
}
