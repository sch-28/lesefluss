import {
	DISPLAY_NAME_MAX_LENGTH,
	isNotificationType,
	type NotificationType,
	PUSH_PREVIEW_MAX_CHARS,
	pushCategoryOf,
	pushRoute,
} from "@lesefluss/core";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { DbExecutor } from "~/db";
import {
	buddyRead,
	buddyReadComment,
	buddyReadInvite,
	buddyReadMember,
	buddyReadSharedHighlight,
	type SocialPushOutboxRow,
	socialShare,
	syncBooks,
} from "~/db/schema";
import { isVisibleToViewer } from "~/lib/social/discussion-gate";
import { findPushableItem } from "~/lib/social/inbox";
import { friendshipExists } from "~/lib/social/relationship";
import type { PushMessage } from "./fcm";
import { loadPushPreferences } from "./preferences";

const TITLE_MAX_CHARS = 60;

const INBOX_ROUTE = pushRoute({ kind: "inbox" });
const buddyReadRoute = (buddyReadId: string) => pushRoute({ kind: "buddy-read", buddyReadId });
const discussionRoute = (buddyReadId: string) =>
	pushRoute({ kind: "buddy-read-discussion", buddyReadId });

/** Types whose event only makes sense between friends: an unfriend since then silences them. */
const FRIENDS_ONLY_TYPES: readonly NotificationType[] = [
	"friend_request_accepted",
	"share_received",
	"share_accepted",
];

type Rendered = { body: string; route: string };

/** Counts code points, so an emoji is never cut in half into a lone surrogate FCM rejects. */
function clip(text: string, max: number): string {
	const chars = Array.from(text.replace(/\s+/g, " ").trim());
	return chars.length <= max
		? chars.join("")
		: `${chars
				.slice(0, max - 1)
				.join("")
				.trimEnd()}…`;
}

const quoted = (title: string) => `“${clip(title, TITLE_MAX_CHARS)}”`;

/**
 * Renders a queued push, or null when it must not go out: the category is
 * off, the item is gone, read or hidden from the recipient (block, takedown,
 * banned actor), or the two are no longer friends where that matters.
 */
export async function composePush(
	exec: DbExecutor,
	row: SocialPushOutboxRow,
	now: Date,
): Promise<PushMessage | null> {
	const category = pushCategoryOf(row.type);
	if (!category) return null;
	const preferences = await loadPushPreferences(exec, row.recipientId);
	if (!preferences[category]) return null;
	const item = await findPushableItem(
		exec,
		{ ...row, actorId: category === "discussion" ? null : row.actorId },
		now,
	);
	if (!item) return null;
	if (
		isNotificationType(row.type) &&
		FRIENDS_ONLY_TYPES.includes(row.type) &&
		!(await friendshipExists(exec, row.recipientId, item.actorId))
	) {
		return null;
	}
	const rendered = await render(exec, row, item.actorId, preferences.previews, now);
	if (!rendered) return null;
	// `user.name` has no length limit on every path that sets it.
	const actorName = clip(item.actorName, DISPLAY_NAME_MAX_LENGTH);
	return {
		title:
			category === "discussion" && item.payload ? `${actorName} ${item.payload.text}` : actorName,
		body: rendered.body,
		tag: `${row.type}:${row.subjectId}`,
		data: { route: rendered.route, inboxItemId: item.id },
	};
}

async function render(
	exec: DbExecutor,
	row: SocialPushOutboxRow,
	actorId: string,
	shouldShowPreviews: boolean,
	now: Date,
): Promise<Rendered | null> {
	switch (row.type) {
		case "friend_request_received":
			return { body: "Sent you a friend request", route: INBOX_ROUTE };
		case "friend_request_accepted":
			return { body: "Accepted your friend request", route: INBOX_ROUTE };
		case "share_received": {
			const title = await shareTitle(exec, row.subjectId);
			return {
				body: title ? `Shared ${quoted(title)} with you` : "Shared a book with you",
				route: INBOX_ROUTE,
			};
		}
		case "share_accepted": {
			const title = await shareTitle(exec, row.subjectId);
			return {
				body: title
					? `Added ${quoted(title)} to their library`
					: "Added your book to their library",
				route: INBOX_ROUTE,
			};
		}
		case "buddy_read_invite": {
			const [invite] = await exec
				.select({ buddyReadId: buddyReadInvite.buddyReadId })
				.from(buddyReadInvite)
				.where(eq(buddyReadInvite.id, row.subjectId));
			if (!invite) return null;
			const title = await buddyReadTitle(exec, invite.buddyReadId, actorId);
			return {
				body: title
					? `Invited you to read ${quoted(title)} together`
					: "Invited you to a buddy read",
				route: INBOX_ROUTE,
			};
		}
		case "buddy_read_joined": {
			const title = await buddyReadTitle(exec, row.subjectId, actorId);
			return {
				body: title ? `Joined your buddy read of ${quoted(title)}` : "Joined your buddy read",
				route: buddyReadRoute(row.subjectId),
			};
		}
		case "buddy_read_finished": {
			const title = await buddyReadTitle(exec, row.subjectId, actorId);
			return {
				body: title ? `Finished ${quoted(title)}` : "Finished the book of your buddy read",
				route: buddyReadRoute(row.subjectId),
			};
		}
		case "buddy_read_reply":
			return renderReply(exec, row, actorId, shouldShowPreviews, now);
		case "buddy_read_reaction":
			return renderReaction(exec, row.subjectId);
		default:
			return null;
	}
}

/** Null when the sender hid the book from their profile, or it is no longer theirs. */
async function shareTitle(exec: DbExecutor, shareId: string): Promise<string | null> {
	const [row] = await exec
		.select({ title: socialShare.title, isHidden: syncBooks.hideFromProfile })
		.from(socialShare)
		.leftJoin(
			syncBooks,
			and(eq(syncBooks.userId, socialShare.senderId), eq(syncBooks.bookId, socialShare.bookId)),
		)
		.where(eq(socialShare.id, shareId));
	return row && row.isHidden === false ? row.title : null;
}

/** Null when the actor hid their copy of the book from their profile. */
async function buddyReadTitle(
	exec: DbExecutor,
	buddyReadId: string,
	actorId: string,
): Promise<string | null> {
	const [row] = await exec
		.select({ title: buddyRead.title, isHidden: syncBooks.hideFromProfile })
		.from(buddyRead)
		.leftJoin(
			buddyReadMember,
			and(eq(buddyReadMember.buddyReadId, buddyRead.id), eq(buddyReadMember.userId, actorId)),
		)
		.leftJoin(
			syncBooks,
			and(eq(syncBooks.userId, actorId), eq(syncBooks.bookId, buddyReadMember.bookId)),
		)
		.where(eq(buddyRead.id, buddyReadId));
	return row && row.isHidden === false ? row.title : null;
}

/** The subject is the recipient's comment; the preview is the actor's latest reply to it. */
async function renderReply(
	exec: DbExecutor,
	row: SocialPushOutboxRow,
	actorId: string,
	shouldShowPreviews: boolean,
	now: Date,
): Promise<Rendered | null> {
	const [parent] = await exec
		.select({ buddyReadId: buddyReadComment.buddyReadId })
		.from(buddyReadComment)
		.where(eq(buddyReadComment.id, row.subjectId));
	if (!parent) return null;
	const fallback = { body: "Replied to your comment", route: discussionRoute(parent.buddyReadId) };
	if (!shouldShowPreviews) return fallback;
	const [reply] = await exec
		.select({
			body: buddyReadComment.body,
			anchorKind: buddyReadComment.anchorKind,
			startWord: buddyReadComment.startWord,
			endWord: buddyReadComment.endWord,
		})
		.from(buddyReadComment)
		.where(
			and(
				eq(buddyReadComment.parentId, row.subjectId),
				eq(buddyReadComment.authorId, actorId),
				isNull(buddyReadComment.deletedAt),
			),
		)
		.orderBy(desc(buddyReadComment.createdAt))
		.limit(1);
	if (!reply?.body) return fallback;
	const isUnlocked = await isVisibleToViewer(
		exec,
		parent.buddyReadId,
		row.recipientId,
		{ authorId: actorId, ...reply },
		now,
	);
	return isUnlocked ? { ...fallback, body: clip(reply.body, PUSH_PREVIEW_MAX_CHARS) } : fallback;
}

/** The subject is the recipient's comment or shared highlight. */
async function renderReaction(exec: DbExecutor, subjectId: string): Promise<Rendered | null> {
	const [comment] = await exec
		.select({ buddyReadId: buddyReadComment.buddyReadId })
		.from(buddyReadComment)
		.where(eq(buddyReadComment.id, subjectId));
	if (comment) {
		return { body: "Reacted to your comment", route: discussionRoute(comment.buddyReadId) };
	}
	const [highlight] = await exec
		.select({ buddyReadId: buddyReadSharedHighlight.buddyReadId })
		.from(buddyReadSharedHighlight)
		.where(eq(buddyReadSharedHighlight.id, subjectId));
	if (!highlight) return null;
	return { body: "Reacted to your highlight", route: discussionRoute(highlight.buddyReadId) };
}
