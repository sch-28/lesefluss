import { type NoticeTargetType, normalizeHandle, validateHandle } from "@lesefluss/core";
import { and, eq, sql } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import { user } from "~/db/auth-schema";
import {
	buddyRead,
	buddyReadComment,
	buddyReadSharedHighlight,
	socialProfile,
	socialShare,
	syncBooks,
	syncHighlights,
} from "~/db/schema";
import { isVisibleToViewer } from "~/lib/social/discussion-gate";
import { isUuid } from "~/lib/uuid";

export type NoticeSnapshot = Record<string, string | null>;

export type ResolvedTarget = {
	targetUserId: string;
	/** Canonical reference stored on the notice. */
	targetRef: string;
	snapshot: NoticeSnapshot;
};

export type NoticeContext = { title: string; fields: { label: string; value: string | null }[] };

export type NoticeActionKind =
	| "reject"
	| "remove_bio"
	| "remove_avatar"
	| "reset_handle"
	| "take_down_book"
	| "remove_comment"
	| "remove_highlight_share"
	| "suspend_sharing"
	| "ban";

/**
 * One entry per thing a notice can point at. A later feature adds its type
 * here (and to `NOTICE_TARGET_TYPES`); the notice table stays as it is.
 */
export type NoticeTarget = {
	/** From an in-app report, where the client knows the user id. `reporterId` lets a type require a relationship. */
	resolveById(
		exec: DbExecutor,
		targetUserId: string,
		extra: string | undefined,
		reporterId: string,
	): Promise<ResolvedTarget | null>;
	/** From the web form's free-text location. Null keeps the notice with the typed location only. */
	resolveByLocation(exec: DbExecutor, location: string): Promise<ResolvedTarget | null>;
	/** Live state for the admin queue; the snapshot is what it looked like when reported. */
	context(
		exec: DbExecutor,
		notice: { targetRef: string; targetUserId: string | null },
	): Promise<NoticeContext | null>;
	actions: readonly NoticeActionKind[];
};

const EXCERPT_CHARS = 2000;

async function profileByHandle(exec: DbExecutor, raw: string) {
	const handle = raw.replace(/^@/, "");
	if (!validateHandle(handle).ok) return null;
	const [row] = await exec
		.select({ userId: socialProfile.userId, handle: socialProfile.handle })
		.from(socialProfile)
		.where(eq(socialProfile.handle, normalizeHandle(handle)));
	return row ?? null;
}

async function profileSnapshot(exec: DbExecutor, userId: string): Promise<ResolvedTarget | null> {
	const [row] = await exec
		.select({ handle: socialProfile.handle, name: user.name, bio: socialProfile.bio })
		.from(user)
		.leftJoin(socialProfile, eq(socialProfile.userId, user.id))
		.where(eq(user.id, userId));
	if (!row) return null;
	return {
		targetUserId: userId,
		targetRef: row.handle ?? userId,
		snapshot: { handle: row.handle, name: row.name, bio: row.bio ?? null },
	};
}

const profileTarget: NoticeTarget = {
	resolveById: (exec, targetUserId) => profileSnapshot(exec, targetUserId),
	resolveByLocation: async (exec, location) => {
		const profile = await profileByHandle(exec, location.trim());
		return profile ? profileSnapshot(exec, profile.userId) : null;
	},
	// By user id when known: the handle may since have moved to someone else.
	context: async (exec, notice) => {
		const userId =
			notice.targetUserId ?? (await profileByHandle(exec, notice.targetRef))?.userId ?? null;
		const resolved = userId ? await profileSnapshot(exec, userId) : null;
		if (!resolved) return null;
		return {
			title: resolved.snapshot.handle ? `@${resolved.snapshot.handle}` : "(no handle)",
			fields: [
				{ label: "Display name", value: resolved.snapshot.name },
				{ label: "Bio", value: resolved.snapshot.bio },
			],
		};
	},
	actions: ["reject", "remove_bio", "remove_avatar", "reset_handle", "suspend_sharing", "ban"],
};

export function parseBookRef(ref: string): { userId: string; bookId: string } | null {
	const idx = ref.indexOf(":");
	if (idx <= 0 || idx === ref.length - 1) return null;
	return { userId: ref.slice(0, idx), bookId: ref.slice(idx + 1) };
}

async function bookSnapshot(
	exec: DbExecutor,
	userId: string,
	bookId: string,
): Promise<ResolvedTarget | null> {
	const [row] = await exec
		.select({
			title: syncBooks.title,
			author: syncBooks.author,
			source: syncBooks.source,
			catalogId: syncBooks.catalogId,
			originUserId: syncBooks.originUserId,
			originBookId: syncBooks.originBookId,
			handle: socialProfile.handle,
		})
		.from(syncBooks)
		.leftJoin(socialProfile, eq(socialProfile.userId, syncBooks.userId))
		.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookId)));
	if (!row) return null;
	return {
		targetUserId: userId,
		targetRef: `${userId}:${bookId}`,
		snapshot: {
			ownerHandle: row.handle,
			title: row.title,
			author: row.author,
			origin: row.catalogId ?? row.source ?? null,
			// Kept so an origin-scope takedown still knows the origin after the
			// sender's account (and with it the row) is gone.
			originUserId: row.originUserId,
			originBookId: row.originBookId,
		},
	};
}

const sharedBookTarget: NoticeTarget = {
	// Reported through the share the reporter received: no reporting of books one was never shown.
	resolveById: async (exec, targetUserId, shareId, reporterId) => {
		if (!shareId || !isUuid(shareId)) return null;
		const [share] = await exec
			.select({ bookId: socialShare.bookId })
			.from(socialShare)
			.where(
				and(
					eq(socialShare.id, shareId),
					eq(socialShare.senderId, targetUserId),
					eq(socialShare.recipientId, reporterId),
				),
			)
			.limit(1);
		return share ? bookSnapshot(exec, targetUserId, share.bookId) : null;
	},
	resolveByLocation: async (exec, location) => {
		const [handlePart, ...rest] = location.split(/[,\n]/);
		const title = rest.join(",").trim();
		if (!handlePart || !title) return null;
		const profile = await profileByHandle(exec, handlePart.trim());
		if (!profile) return null;
		const [book] = await exec
			.select({ bookId: syncBooks.bookId })
			.from(syncBooks)
			.where(
				and(
					eq(syncBooks.userId, profile.userId),
					eq(syncBooks.deleted, false),
					sql`lower(${syncBooks.title}) = lower(${title})`,
				),
			)
			.limit(1);
		return book ? bookSnapshot(exec, profile.userId, book.bookId) : null;
	},
	context: async (exec, notice) => {
		const ref = parseBookRef(notice.targetRef);
		if (!ref) return null;
		const [row] = await exec
			.select({
				title: syncBooks.title,
				author: syncBooks.author,
				source: syncBooks.source,
				catalogId: syncBooks.catalogId,
				deleted: syncBooks.deleted,
				wordCount: syncBooks.wordCount,
				excerpt: sql<string | null>`left(${syncBooks.content}, ${EXCERPT_CHARS})`,
			})
			.from(syncBooks)
			.where(and(eq(syncBooks.userId, ref.userId), eq(syncBooks.bookId, ref.bookId)));
		if (!row) return null;
		return {
			title: row.title,
			fields: [
				{ label: "Author", value: row.author },
				{ label: "Origin", value: row.catalogId ?? row.source ?? "upload" },
				{ label: "Words", value: row.wordCount === null ? null : String(row.wordCount) },
				{ label: "State", value: row.deleted ? "removed" : "live" },
				{ label: "Excerpt", value: row.excerpt },
			],
		};
	},
	actions: ["reject", "take_down_book", "suspend_sharing", "ban"],
};

async function handleOf(exec: DbExecutor, userId: string | null): Promise<string | null> {
	if (!userId) return null;
	const [row] = await exec
		.select({ handle: socialProfile.handle })
		.from(socialProfile)
		.where(eq(socialProfile.userId, userId));
	return row?.handle ?? null;
}

async function readTitle(exec: DbExecutor, buddyReadId: string): Promise<string | null> {
	const [row] = await exec
		.select({ title: buddyRead.title })
		.from(buddyRead)
		.where(eq(buddyRead.id, buddyReadId));
	return row?.title ?? null;
}

async function commentRow(exec: DbExecutor, commentId: string) {
	if (!isUuid(commentId)) return null;
	const [row] = await exec
		.select()
		.from(buddyReadComment)
		.where(eq(buddyReadComment.id, commentId));
	return row ?? null;
}

/** Only a member who can see the comment right now can report it. */
const buddyReadCommentTarget: NoticeTarget = {
	resolveById: async (exec, targetUserId, commentId, reporterId) => {
		const comment = commentId ? await commentRow(exec, commentId) : null;
		if (!comment || comment.authorId !== targetUserId || comment.body === null) return null;
		const visible = await isVisibleToViewer(exec, comment.buddyReadId, reporterId, {
			authorId: comment.authorId,
			startWord: comment.startWord,
		});
		if (!visible) return null;
		return {
			targetUserId,
			targetRef: comment.id,
			snapshot: {
				authorHandle: await handleOf(exec, targetUserId),
				buddyRead: await readTitle(exec, comment.buddyReadId),
				body: comment.body,
			},
		};
	},
	// Nobody outside a buddy read can point at one of its comments.
	resolveByLocation: async () => null,
	context: async (exec, notice) => {
		const comment = await commentRow(exec, notice.targetRef);
		return {
			title: "Buddy-read comment",
			fields: [
				{
					label: "State",
					value: !comment ? "deleted" : comment.body === null ? "removed" : "live",
				},
				{ label: "Current text", value: comment?.body ?? null },
			],
		};
	},
	actions: ["reject", "remove_comment", "suspend_sharing", "ban"],
};

async function sharedHighlightRow(exec: DbExecutor, sharedHighlightId: string) {
	if (!isUuid(sharedHighlightId)) return null;
	const [row] = await exec
		.select({
			id: buddyReadSharedHighlight.id,
			buddyReadId: buddyReadSharedHighlight.buddyReadId,
			userId: buddyReadSharedHighlight.userId,
			removedAt: buddyReadSharedHighlight.removedAt,
			startWord: syncHighlights.startWord,
			text: syncHighlights.text,
			note: syncHighlights.note,
			deleted: syncHighlights.deleted,
		})
		.from(buddyReadSharedHighlight)
		.leftJoin(
			syncHighlights,
			and(
				eq(syncHighlights.userId, buddyReadSharedHighlight.userId),
				eq(syncHighlights.highlightId, buddyReadSharedHighlight.highlightId),
			),
		)
		.where(eq(buddyReadSharedHighlight.id, sharedHighlightId));
	return row ?? null;
}

const buddyReadHighlightTarget: NoticeTarget = {
	resolveById: async (exec, targetUserId, sharedHighlightId, reporterId) => {
		const share = sharedHighlightId ? await sharedHighlightRow(exec, sharedHighlightId) : null;
		if (
			!share ||
			share.userId !== targetUserId ||
			share.removedAt ||
			share.deleted !== false ||
			share.startWord === null
		) {
			return null;
		}
		const visible = await isVisibleToViewer(exec, share.buddyReadId, reporterId, {
			authorId: share.userId,
			startWord: share.startWord,
		});
		if (!visible) return null;
		return {
			targetUserId,
			targetRef: share.id,
			snapshot: {
				authorHandle: await handleOf(exec, targetUserId),
				buddyRead: await readTitle(exec, share.buddyReadId),
				text: share.text,
				note: share.note,
			},
		};
	},
	resolveByLocation: async () => null,
	context: async (exec, notice) => {
		const share = await sharedHighlightRow(exec, notice.targetRef);
		return {
			title: "Shared highlight",
			fields: [
				{
					label: "State",
					value: !share
						? "unshared"
						: share.removedAt
							? "removed"
							: share.deleted
								? "deleted by author"
								: "live",
				},
				{ label: "Current text", value: share?.text ?? null },
				{ label: "Current note", value: share?.note ?? null },
			],
		};
	},
	actions: ["reject", "remove_highlight_share", "suspend_sharing", "ban"],
};

export const NOTICE_TARGETS: Record<NoticeTargetType, NoticeTarget> = {
	profile: profileTarget,
	shared_book: sharedBookTarget,
	buddy_read_comment: buddyReadCommentTarget,
	buddy_read_highlight: buddyReadHighlightTarget,
};
