import {
	BUDDY_REACTIONS,
	type BuddyReaction,
	type DiscussionAnchor,
	type DiscussionComment,
	type DiscussionHighlight,
	type DiscussionItem,
	type DiscussionPage,
	type DiscussionReply,
	type ReactionSummary,
} from "@lesefluss/core";
import { and, asc, count, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { type DbExecutor, db, type Tx } from "~/db";
import { user } from "~/db/auth-schema";
import {
	type BuddyReadComment,
	buddyRead,
	buddyReadComment,
	buddyReadMember,
	buddyReadReaction,
	buddyReadSharedHighlight,
	socialBlock,
	socialNotification,
	socialProfile,
	syncBooks,
	syncHighlights,
} from "~/db/schema";
import { isSharingSuspended } from "~/lib/moderation/restrictions";
import { loadState, type ReadState, visibleTo } from "./buddy-reads";
import {
	canSeeAuthor,
	type GatedAnchor,
	isUnlockedFor,
	refreshFurthestWord,
	unlockWordOf,
} from "./discussion-gate";
import { SocialError } from "./errors";
import { createNotification } from "./inbox";
import { hasBlockEitherWay, identityOf, loadSocialUsers, type SocialUser } from "./relationship";

type Member = ReadState["current"][number];

/** The read, as seen by one of its current members. Taken-down reads have no discussion. */
async function openAsMember(
	exec: DbExecutor,
	userId: string,
	buddyReadId: string,
	now: Date,
): Promise<{ state: ReadState; me: Member }> {
	const [read] = await exec.select().from(buddyRead).where(eq(buddyRead.id, buddyReadId));
	const state = read ? await loadState(exec, read, now) : null;
	const me = state?.current.find((m) => m.userId === userId);
	if (!state || !me) throw new SocialError("not_found");
	if (state.takenDown) throw new SocialError("unavailable");
	return { state, me };
}

/** A range must lie inside the member's copy; a chapter anchor must be a chapter start in it. */
async function validateAnchor(
	exec: DbExecutor,
	userId: string,
	bookId: string,
	anchor: DiscussionAnchor,
): Promise<void> {
	const [book] = await exec
		.select({ wordCount: syncBooks.wordCount, chapters: syncBooks.chapters })
		.from(syncBooks)
		.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookId)));
	if (!book || book.wordCount === null) throw new SocialError("invalid_anchor");
	if (anchor.kind === "range") {
		const inside = anchor.startWord <= anchor.endWord && anchor.endWord < book.wordCount;
		if (!inside) throw new SocialError("invalid_anchor");
		return;
	}
	let starts: number[] = [];
	try {
		const parsed: unknown = JSON.parse(book.chapters ?? "[]");
		if (Array.isArray(parsed)) {
			starts = parsed
				.map((c) => (c as { startWord?: unknown }).startWord)
				.filter(Number.isInteger) as number[];
		}
	} catch {
		starts = [];
	}
	if (!starts.includes(anchor.startWord)) throw new SocialError("invalid_anchor");
}

function gatedAnchorOf(c: BuddyReadComment): GatedAnchor {
	return { authorId: c.authorId, startWord: c.startWord };
}

/**
 * One inbox item per (recipient, type, subject): a new actor replaces the
 * previous one and the payload says how many others there were.
 */
async function notifyCollapsed(
	tx: Tx,
	input: {
		recipientId: string;
		actorId: string;
		type: "buddy_read_reply" | "buddy_read_reaction";
		subjectId: string;
		others: number;
	},
	now: Date,
): Promise<void> {
	if (input.recipientId === input.actorId) return;
	if (await hasBlockEitherWay(tx, input.recipientId, input.actorId)) return;
	await tx
		.delete(socialNotification)
		.where(
			and(
				eq(socialNotification.recipientId, input.recipientId),
				eq(socialNotification.type, input.type),
				eq(socialNotification.subjectId, input.subjectId),
			),
		);
	await createNotification(
		tx,
		{
			recipientId: input.recipientId,
			actorId: input.actorId,
			type: input.type,
			subjectId: input.subjectId,
			payload:
				input.others > 0
					? { text: `and ${input.others} ${input.others === 1 ? "other" : "others"}` }
					: undefined,
		},
		now,
	);
}

/** Matches the discussion list: nobody the recipient cannot see counts, not even as a number. */
function visibleToRecipient(recipientId: string, userColumn: AnyPgColumn, now: Date) {
	return sql`EXISTS (SELECT 1 FROM ${user} JOIN ${socialProfile} ON ${socialProfile.userId} = ${user.id} WHERE ${user.id} = ${userColumn} AND ${socialProfile.handle} IS NOT NULL AND (${user.banned} IS NOT TRUE OR ${user.banExpires} <= ${now}))
		AND NOT EXISTS (SELECT 1 FROM ${socialBlock} WHERE (${socialBlock.blockerId} = ${recipientId} AND ${socialBlock.blockedId} = ${userColumn}) OR (${socialBlock.blockedId} = ${recipientId} AND ${socialBlock.blockerId} = ${userColumn}))`;
}

export async function postComment(
	userId: string,
	input: { buddyReadId: string; anchor: DiscussionAnchor; body: string },
	now = new Date(),
): Promise<{ commentId: string }> {
	return db.transaction(async (tx) => {
		const { me } = await openAsMember(tx, userId, input.buddyReadId, now);
		await refreshFurthestWord(tx, input.buddyReadId, userId);
		await validateAnchor(tx, userId, me.bookId, input.anchor);
		const a = input.anchor;
		const [row] = await tx
			.insert(buddyReadComment)
			.values({
				buddyReadId: input.buddyReadId,
				authorId: userId,
				anchorKind: a.kind,
				startWord: a.startWord,
				startCharInWord: a.kind === "range" ? a.startCharInWord : 0,
				endWord: a.kind === "range" ? a.endWord : a.startWord,
				endCharInWord: a.kind === "range" ? a.endCharInWord : 0,
				body: input.body,
				createdAt: now,
			})
			.returning({ id: buddyReadComment.id });
		if (!row) throw new Error("comment insert returned nothing");
		return { commentId: row.id };
	});
}

async function loadComment(exec: DbExecutor, commentId: string): Promise<BuddyReadComment> {
	const [row] = await exec
		.select()
		.from(buddyReadComment)
		.where(eq(buddyReadComment.id, commentId));
	if (!row) throw new SocialError("not_found");
	return row;
}

/** One level deep: the reply takes over the parent's anchor, so it unlocks with it. */
export async function replyToComment(
	userId: string,
	input: { parentId: string; body: string },
	now = new Date(),
): Promise<{ commentId: string }> {
	return db.transaction(async (tx) => {
		const parent = await loadComment(tx, input.parentId);
		if (parent.parentId || parent.body === null || parent.kind !== "comment") {
			throw new SocialError("not_found");
		}
		await openAsMember(tx, userId, parent.buddyReadId, now);
		const viewer = await refreshFurthestWord(tx, parent.buddyReadId, userId);
		const hidden = parent.authorId
			? !(await canSeeAuthor(tx, userId, parent.authorId, now))
			: false;
		if (!viewer || hidden || !isUnlockedFor(viewer, gatedAnchorOf(parent))) {
			throw new SocialError("not_found");
		}
		const [row] = await tx
			.insert(buddyReadComment)
			.values({
				buddyReadId: parent.buddyReadId,
				authorId: userId,
				parentId: parent.id,
				anchorKind: parent.anchorKind,
				startWord: parent.startWord,
				startCharInWord: parent.startCharInWord,
				endWord: parent.endWord,
				endCharInWord: parent.endCharInWord,
				body: input.body,
				createdAt: now,
			})
			.returning({ id: buddyReadComment.id });
		if (!row) throw new Error("reply insert returned nothing");
		if (parent.authorId) {
			const [others] = await tx
				.select({ n: sql<number>`count(DISTINCT ${buddyReadComment.authorId})::int` })
				.from(buddyReadComment)
				.where(
					and(
						eq(buddyReadComment.parentId, parent.id),
						isNotNull(buddyReadComment.authorId),
						sql`${buddyReadComment.authorId} NOT IN (${userId}, ${parent.authorId})`,
						visibleToRecipient(parent.authorId, buddyReadComment.authorId, now),
					),
				);
			await notifyCollapsed(
				tx,
				{
					recipientId: parent.authorId,
					actorId: userId,
					type: "buddy_read_reply",
					subjectId: parent.id,
					others: others?.n ?? 0,
				},
				now,
			);
		}
		return { commentId: row.id };
	});
}

export async function editComment(
	userId: string,
	input: { commentId: string; body: string },
	now = new Date(),
): Promise<void> {
	await db.transaction(async (tx) => {
		const comment = await loadComment(tx, input.commentId);
		if (comment.authorId !== userId || comment.body === null) throw new SocialError("not_found");
		await openAsMember(tx, userId, comment.buddyReadId, now);
		await tx
			.update(buddyReadComment)
			.set({ body: input.body, editedAt: now })
			.where(eq(buddyReadComment.id, comment.id));
	});
}

/** Also for someone who has left: their words are theirs to take back. */
export async function deleteComment(userId: string, commentId: string, now = new Date()) {
	await db.transaction(async (tx) => {
		const comment = await loadComment(tx, commentId);
		if (comment.authorId !== userId || comment.body === null) throw new SocialError("not_found");
		await removeComment(tx, comment.id, now);
	});
}

/** Gone entirely without replies; with replies, a body- and author-less placeholder keeps the thread. */
export async function removeComment(tx: Tx, commentId: string, now: Date): Promise<void> {
	const [replies] = await tx
		.select({ n: count() })
		.from(buddyReadComment)
		.where(eq(buddyReadComment.parentId, commentId));
	if ((replies?.n ?? 0) === 0) {
		await tx.delete(buddyReadComment).where(eq(buddyReadComment.id, commentId));
		return;
	}
	await tx
		.update(buddyReadComment)
		.set({ body: null, authorId: null, deletedAt: now })
		.where(eq(buddyReadComment.id, commentId));
	await tx.delete(buddyReadReaction).where(eq(buddyReadReaction.commentId, commentId));
}

/** The author's live highlight on their linked book, or null. */
async function liveHighlight(
	exec: DbExecutor,
	userId: string,
	highlightId: string,
	bookId: string,
) {
	const [row] = await exec
		.select()
		.from(syncHighlights)
		.where(
			and(
				eq(syncHighlights.userId, userId),
				eq(syncHighlights.highlightId, highlightId),
				eq(syncHighlights.bookId, bookId),
				eq(syncHighlights.deleted, false),
			),
		);
	return row ?? null;
}

export async function shareHighlight(
	userId: string,
	input: { buddyReadId: string; highlightId: string },
	now = new Date(),
): Promise<{ sharedHighlightId: string }> {
	return db.transaction(async (tx) => {
		const { me } = await openAsMember(tx, userId, input.buddyReadId, now);
		if (await isSharingSuspended(userId, now, tx)) throw new SocialError("suspended");
		const highlight = await liveHighlight(tx, userId, input.highlightId, me.bookId);
		if (!highlight) throw new SocialError("highlight_not_synced");
		if (highlight.text === null) throw new SocialError("highlight_no_text");
		const [existing] = await tx
			.select()
			.from(buddyReadSharedHighlight)
			.where(
				and(
					eq(buddyReadSharedHighlight.buddyReadId, input.buddyReadId),
					eq(buddyReadSharedHighlight.userId, userId),
					eq(buddyReadSharedHighlight.highlightId, input.highlightId),
				),
			);
		if (existing?.removedAt) throw new SocialError("highlight_removed");
		if (existing) {
			await tx
				.update(buddyReadSharedHighlight)
				.set({ sharedIndividually: true })
				.where(eq(buddyReadSharedHighlight.id, existing.id));
			return { sharedHighlightId: existing.id };
		}
		const [row] = await tx
			.insert(buddyReadSharedHighlight)
			.values({
				buddyReadId: input.buddyReadId,
				userId,
				highlightId: input.highlightId,
				createdAt: now,
			})
			.returning({ id: buddyReadSharedHighlight.id });
		if (!row) throw new Error("share insert returned nothing");
		return { sharedHighlightId: row.id };
	});
}

/** Removes the reference, and with it every reaction. Under share-all the highlight would come straight back. */
export async function unshareHighlight(userId: string, sharedHighlightId: string) {
	await db.transaction(async (tx) => {
		const [share] = await tx
			.select()
			.from(buddyReadSharedHighlight)
			.where(
				and(
					eq(buddyReadSharedHighlight.id, sharedHighlightId),
					eq(buddyReadSharedHighlight.userId, userId),
					isNull(buddyReadSharedHighlight.removedAt),
				),
			);
		if (!share) throw new SocialError("not_found");
		const [member] = await tx
			.select({ shareAll: buddyReadMember.shareAllHighlights })
			.from(buddyReadMember)
			.where(
				and(
					eq(buddyReadMember.buddyReadId, share.buddyReadId),
					eq(buddyReadMember.userId, userId),
					eq(buddyReadMember.state, "active"),
				),
			);
		if (member?.shareAll) throw new SocialError("share_all_on");
		await tx.delete(buddyReadSharedHighlight).where(eq(buddyReadSharedHighlight.id, share.id));
	});
}

export async function updateDiscussionSettings(
	userId: string,
	input: { buddyReadId: string; shareAllHighlights?: boolean; showEverything?: boolean },
	now = new Date(),
): Promise<void> {
	await db.transaction(async (tx) => {
		await openAsMember(tx, userId, input.buddyReadId, now);
		if (input.shareAllHighlights && (await isSharingSuspended(userId, now, tx))) {
			throw new SocialError("suspended");
		}
		const set: Partial<typeof buddyReadMember.$inferInsert> = {};
		if (input.shareAllHighlights !== undefined) set.shareAllHighlights = input.shareAllHighlights;
		if (input.showEverything !== undefined) set.showEverything = input.showEverything;
		if (Object.keys(set).length === 0) return;
		await tx
			.update(buddyReadMember)
			.set(set)
			.where(
				and(eq(buddyReadMember.buddyReadId, input.buddyReadId), eq(buddyReadMember.userId, userId)),
			);
		if (input.shareAllHighlights === false) {
			await tx
				.delete(buddyReadSharedHighlight)
				.where(
					and(
						eq(buddyReadSharedHighlight.buddyReadId, input.buddyReadId),
						eq(buddyReadSharedHighlight.userId, userId),
						eq(buddyReadSharedHighlight.sharedIndividually, false),
						isNull(buddyReadSharedHighlight.removedAt),
					),
				);
		}
	});
}

/** What a reaction or a report points at, with the gate inputs for it. */
type Target = { buddyReadId: string; authorId: string | null; anchor: GatedAnchor };

async function resolveTarget(
	exec: DbExecutor,
	input: { commentId?: string; sharedHighlightId?: string },
	now: Date,
): Promise<Target> {
	if (input.commentId) {
		const comment = await loadComment(exec, input.commentId);
		if (comment.body === null) throw new SocialError("not_found");
		return {
			buddyReadId: comment.buddyReadId,
			authorId: comment.authorId,
			anchor: gatedAnchorOf(comment),
		};
	}
	const [share] = await exec
		.select({
			buddyReadId: buddyReadSharedHighlight.buddyReadId,
			userId: buddyReadSharedHighlight.userId,
			highlightId: buddyReadSharedHighlight.highlightId,
		})
		.from(buddyReadSharedHighlight)
		.where(
			and(
				eq(buddyReadSharedHighlight.id, input.sharedHighlightId ?? ""),
				isNull(buddyReadSharedHighlight.removedAt),
			),
		);
	if (!share) throw new SocialError("not_found");
	const [read] = await exec.select().from(buddyRead).where(eq(buddyRead.id, share.buddyReadId));
	const state = read ? await loadState(exec, read, now) : null;
	const owner = state?.current.find((m) => m.userId === share.userId);
	const highlight = owner
		? await liveHighlight(exec, share.userId, share.highlightId, owner.bookId)
		: null;
	if (!highlight) throw new SocialError("not_found");
	return {
		buddyReadId: share.buddyReadId,
		authorId: share.userId,
		anchor: { authorId: share.userId, startWord: highlight.startWord },
	};
}

/** Target visible to this member: its author is visible to them, and they have read far enough. */
async function requireVisibleTarget(tx: Tx, userId: string, target: Target, now: Date) {
	await openAsMember(tx, userId, target.buddyReadId, now);
	const viewer = await refreshFurthestWord(tx, target.buddyReadId, userId);
	const hidden = target.authorId ? !(await canSeeAuthor(tx, userId, target.authorId, now)) : false;
	if (!viewer || hidden || !isUnlockedFor(viewer, target.anchor))
		throw new SocialError("not_found");
}

export async function addReaction(
	userId: string,
	input: { commentId?: string; sharedHighlightId?: string; emoji: BuddyReaction },
	now = new Date(),
): Promise<void> {
	await db.transaction(async (tx) => {
		const target = await resolveTarget(tx, input, now);
		await requireVisibleTarget(tx, userId, target, now);
		const inserted = await tx
			.insert(buddyReadReaction)
			.values({
				buddyReadId: target.buddyReadId,
				userId,
				commentId: input.commentId ?? null,
				sharedHighlightId: input.sharedHighlightId ?? null,
				emoji: input.emoji,
				createdAt: now,
			})
			.onConflictDoNothing()
			.returning({ id: buddyReadReaction.id });
		if (inserted.length === 0 || !target.authorId) return;
		const subjectId = input.commentId ?? input.sharedHighlightId ?? "";
		const [others] = await tx
			.select({ n: sql<number>`count(DISTINCT ${buddyReadReaction.userId})::int` })
			.from(buddyReadReaction)
			.where(
				and(
					input.commentId
						? eq(buddyReadReaction.commentId, input.commentId)
						: eq(buddyReadReaction.sharedHighlightId, input.sharedHighlightId ?? ""),
					sql`${buddyReadReaction.userId} NOT IN (${userId}, ${target.authorId})`,
					visibleToRecipient(target.authorId, buddyReadReaction.userId, now),
				),
			);
		await notifyCollapsed(
			tx,
			{
				recipientId: target.authorId,
				actorId: userId,
				type: "buddy_read_reaction",
				subjectId,
				others: others?.n ?? 0,
			},
			now,
		);
	});
}

export async function removeReaction(
	userId: string,
	input: { commentId?: string; sharedHighlightId?: string; emoji: BuddyReaction },
): Promise<void> {
	await db
		.delete(buddyReadReaction)
		.where(
			and(
				eq(buddyReadReaction.userId, userId),
				eq(buddyReadReaction.emoji, input.emoji),
				input.commentId
					? eq(buddyReadReaction.commentId, input.commentId)
					: eq(buddyReadReaction.sharedHighlightId, input.sharedHighlightId ?? ""),
			),
		);
}

/** Share-all covers highlights made later too: give each a reference row so it can take reactions and reports. */
async function materializeShareAll(tx: Tx, state: ReadState, now: Date): Promise<void> {
	const flags = await tx
		.select({ userId: buddyReadMember.userId })
		.from(buddyReadMember)
		.where(
			and(
				eq(buddyReadMember.buddyReadId, state.read.id),
				eq(buddyReadMember.state, "active"),
				eq(buddyReadMember.shareAllHighlights, true),
			),
		);
	for (const { userId } of flags) {
		const member = state.current.find((m) => m.userId === userId);
		if (!member) continue;
		const rows = await tx
			.select({ highlightId: syncHighlights.highlightId })
			.from(syncHighlights)
			.where(
				and(
					eq(syncHighlights.userId, userId),
					eq(syncHighlights.bookId, member.bookId),
					eq(syncHighlights.deleted, false),
					isNotNull(syncHighlights.text),
				),
			);
		if (rows.length === 0) continue;
		await tx
			.insert(buddyReadSharedHighlight)
			.values(
				rows.map((r) => ({
					buddyReadId: state.read.id,
					userId,
					highlightId: r.highlightId,
					sharedIndividually: false,
					createdAt: now,
				})),
			)
			.onConflictDoNothing();
	}
}

function summarize(
	rows: { targetId: string; userId: string; emoji: string }[],
	viewerId: string,
	hidden: Set<string>,
): Map<string, ReactionSummary[]> {
	const byTarget = new Map<string, Map<string, { count: number; mine: boolean }>>();
	for (const r of rows) {
		if (hidden.has(r.userId)) continue;
		const perEmoji = byTarget.get(r.targetId) ?? new Map();
		const entry = perEmoji.get(r.emoji) ?? { count: 0, mine: false };
		entry.count += 1;
		if (r.userId === viewerId) entry.mine = true;
		perEmoji.set(r.emoji, entry);
		byTarget.set(r.targetId, perEmoji);
	}
	const out = new Map<string, ReactionSummary[]>();
	for (const [targetId, perEmoji] of byTarget) {
		out.set(
			targetId,
			BUDDY_REACTIONS.filter((e) => perEmoji.has(e)).map((emoji) => ({
				emoji,
				count: perEmoji.get(emoji)?.count ?? 0,
				mine: perEmoji.get(emoji)?.mine ?? false,
			})),
		);
	}
	return out;
}

/**
 * The discussion as this member may see it: comments of anyone who ever
 * joined, shared highlights of current members only, each gated by the
 * viewer's furthest position, with blocked or banned people left out
 * entirely (including from the count of hidden items).
 */
export async function getDiscussion(
	viewerId: string,
	buddyReadId: string,
	now = new Date(),
): Promise<DiscussionPage> {
	return db.transaction(async (tx) => {
		const { state } = await openAsMember(tx, viewerId, buddyReadId, now);
		const viewer = await refreshFurthestWord(tx, buddyReadId, viewerId);
		if (!viewer) throw new SocialError("not_found");
		await materializeShareAll(tx, state, now);
		const [myFlags] = await tx
			.select({ shareAll: buddyReadMember.shareAllHighlights })
			.from(buddyReadMember)
			.where(
				and(eq(buddyReadMember.buddyReadId, buddyReadId), eq(buddyReadMember.userId, viewerId)),
			);

		const comments = await tx
			.select()
			.from(buddyReadComment)
			.where(eq(buddyReadComment.buddyReadId, buddyReadId))
			.orderBy(asc(buddyReadComment.createdAt));
		const shares = await tx
			.select({
				id: buddyReadSharedHighlight.id,
				userId: buddyReadSharedHighlight.userId,
				bookId: syncHighlights.bookId,
				startWord: syncHighlights.startWord,
				endWord: syncHighlights.endWord,
				text: syncHighlights.text,
				note: syncHighlights.note,
				color: syncHighlights.color,
				createdAt: buddyReadSharedHighlight.createdAt,
			})
			.from(buddyReadSharedHighlight)
			.innerJoin(
				syncHighlights,
				and(
					eq(syncHighlights.userId, buddyReadSharedHighlight.userId),
					eq(syncHighlights.highlightId, buddyReadSharedHighlight.highlightId),
					eq(syncHighlights.deleted, false),
				),
			)
			.where(
				and(
					eq(buddyReadSharedHighlight.buddyReadId, buddyReadId),
					isNull(buddyReadSharedHighlight.removedAt),
				),
			);
		const currentBooks = new Map(state.current.map((m) => [m.userId, m.bookId]));
		const liveShares = shares.filter(
			(s) => currentBooks.get(s.userId) === s.bookId && s.text !== null,
		);

		const authorIds = new Set<string>();
		for (const c of comments) if (c.authorId) authorIds.add(c.authorId);
		for (const s of liveShares) authorIds.add(s.userId);
		const users = await loadSocialUsers(tx, [...authorIds, viewerId]);
		const shown = await visibleTo(tx, viewerId, users, now);
		const hiddenPeople = new Set([...authorIds].filter((id) => !shown.has(id)));
		const identity = (id: string | null) => {
			if (!id || hiddenPeople.has(id)) return null;
			const u: SocialUser | undefined = users.get(id);
			return u ? identityOf(u) : null;
		};

		const topLevel = comments.filter((c) => c.parentId === null && c.kind === "comment");
		const repliesByParent = new Map<string, BuddyReadComment[]>();
		for (const c of comments) {
			if (!c.parentId) continue;
			if (c.authorId && hiddenPeople.has(c.authorId)) continue;
			const list = repliesByParent.get(c.parentId) ?? [];
			list.push(c);
			repliesByParent.set(c.parentId, list);
		}

		let hiddenAhead = 0;
		let nextUnlockWord: number | null = null;
		const hide = (anchor: GatedAnchor) => {
			hiddenAhead += 1;
			const at = unlockWordOf(anchor);
			if (nextUnlockWord === null || at < nextUnlockWord) nextUnlockWord = at;
		};
		const visibleComments: BuddyReadComment[] = [];
		for (const c of topLevel) {
			if (c.authorId && hiddenPeople.has(c.authorId)) continue;
			const replies = repliesByParent.get(c.id) ?? [];
			if (c.body === null && replies.length === 0) continue;
			const anchor = gatedAnchorOf(c);
			if (isUnlockedFor(viewer, anchor)) visibleComments.push(c);
			else hide(anchor);
		}
		const visibleShares = liveShares.filter((s) => {
			if (hiddenPeople.has(s.userId)) return false;
			const anchor = { authorId: s.userId, startWord: s.startWord };
			const unlocked = isUnlockedFor(viewer, anchor);
			if (!unlocked) hide(anchor);
			return unlocked;
		});

		const commentIds = visibleComments.flatMap((c) => [
			c.id,
			...(repliesByParent.get(c.id) ?? []).map((r) => r.id),
		]);
		const shareIds = visibleShares.map((s) => s.id);
		const reactionRows =
			commentIds.length + shareIds.length === 0
				? []
				: await tx
						.select({
							commentId: buddyReadReaction.commentId,
							sharedHighlightId: buddyReadReaction.sharedHighlightId,
							userId: buddyReadReaction.userId,
							emoji: buddyReadReaction.emoji,
						})
						.from(buddyReadReaction)
						.where(
							or(
								commentIds.length ? inArray(buddyReadReaction.commentId, commentIds) : undefined,
								shareIds.length
									? inArray(buddyReadReaction.sharedHighlightId, shareIds)
									: undefined,
							),
						);
		const reactorIds = [...new Set(reactionRows.map((r) => r.userId))].filter(
			(id) => !users.has(id),
		);
		const reactors = await loadSocialUsers(tx, reactorIds);
		const reactorsShown = await visibleTo(tx, viewerId, reactors, now);
		const hiddenReactors = new Set([
			...hiddenPeople,
			...reactorIds.filter((id) => !reactorsShown.has(id)),
		]);
		const reactions = summarize(
			reactionRows.map((r) => ({
				targetId: r.commentId ?? r.sharedHighlightId ?? "",
				userId: r.userId,
				emoji: r.emoji,
			})),
			viewerId,
			hiddenReactors,
		);

		const toReply = (r: BuddyReadComment): DiscussionReply => ({
			id: r.id,
			author: r.body === null ? null : identity(r.authorId),
			isOwn: r.authorId === viewerId,
			startWord: r.startWord,
			endWord: r.endWord,
			createdAt: r.createdAt.getTime(),
			reactions: reactions.get(r.id) ?? [],
			body: r.body,
			editedAt: r.editedAt?.getTime() ?? null,
			removed: r.body === null,
		});
		const items: DiscussionItem[] = [
			...visibleComments.map(
				(c): DiscussionComment => ({
					...toReply(c),
					kind: "comment",
					anchorKind: c.anchorKind,
					startCharInWord: c.startCharInWord,
					endCharInWord: c.endCharInWord,
					replies: (repliesByParent.get(c.id) ?? []).filter((r) => r.body !== null).map(toReply),
				}),
			),
			...visibleShares.map(
				(s): DiscussionHighlight => ({
					kind: "highlight",
					id: s.id,
					author: identity(s.userId),
					isOwn: s.userId === viewerId,
					startWord: s.startWord,
					endWord: s.endWord,
					createdAt: s.createdAt.getTime(),
					reactions: reactions.get(s.id) ?? [],
					text: s.text ?? "",
					note: s.note,
					color: s.color,
				}),
			),
		].sort((a, b) => a.startWord - b.startWord || a.createdAt - b.createdAt);

		return {
			items,
			hiddenAhead,
			nextUnlockWord,
			furthestWord: viewer.furthestWord,
			showEverything: viewer.showEverything,
			shareAllHighlights: myFlags?.shareAll ?? false,
		};
	});
}

/**
 * Account deletion: comments without replies go, the rest become removed
 * placeholders so other people's replies keep their thread. Reactions and
 * shared-highlight references cascade with the user.
 */
export async function purgeDiscussionOf(tx: Tx, userId: string, now: Date): Promise<void> {
	const own = await tx
		.select({ id: buddyReadComment.id, parentId: buddyReadComment.parentId })
		.from(buddyReadComment)
		.where(eq(buddyReadComment.authorId, userId));
	// Replies first: a parent whose only replies were the user's own then goes entirely.
	own.sort((a, b) => Number(b.parentId !== null) - Number(a.parentId !== null));
	for (const { id } of own) await removeComment(tx, id, now);
}
