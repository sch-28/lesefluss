import {
	FRIEND_REQUEST_TTL_DAYS,
	type FriendRequestItemState,
	INBOX_MAX_AGE_DAYS,
	INBOX_PAGE_SIZE,
	INBOX_READ_RETENTION_DAYS,
	type InboxItem,
	type InboxPage,
	type NotificationType,
} from "@lesefluss/core";
import { and, count, desc, eq, isNotNull, isNull, lt, not, or, type SQL, sql } from "drizzle-orm";
import { type DbExecutor, db, type Tx } from "~/db";
import { user } from "~/db/auth-schema";
import {
	buddyReadInvite,
	buddyReadMember,
	socialAvatar,
	socialBlock,
	socialFriendRequest,
	socialFriendship,
	socialNotification,
	socialProfile,
	socialShare,
} from "~/db/schema";
import { buddyReadInviteSubjectsFor } from "./buddy-read-items";
import { avatarUrlFor } from "./profile";
import { shareSubjectsFor } from "./share-items";

const DAY_MS = 86_400_000;

export type NotificationInput = {
	recipientId: string;
	/** Null when Lesefluss itself is the sender. */
	actorId: string | null;
	type: NotificationType;
	subjectId?: string;
	payload?: { text: string };
};

/**
 * The one way an inbox item is written. A repeated event lands on the same
 * row: it becomes unread again and moves to the top, and its id stays stable.
 */
export async function createNotification(
	tx: Tx,
	input: NotificationInput,
	now = new Date(),
): Promise<void> {
	await tx
		.insert(socialNotification)
		.values({
			recipientId: input.recipientId,
			actorId: input.actorId,
			type: input.type,
			subjectId: input.subjectId ?? "",
			payload: input.payload ?? null,
			createdAt: now,
			readAt: null,
		})
		.onConflictDoUpdate({
			target: [
				socialNotification.recipientId,
				socialNotification.type,
				socialNotification.actorId,
				socialNotification.subjectId,
			],
			set: { createdAt: now, readAt: null, payload: input.payload ?? null },
		});
}

export async function deleteNotificationsForSubject(
	tx: Tx,
	type: NotificationType,
	subjectId: string,
): Promise<void> {
	await tx
		.delete(socialNotification)
		.where(and(eq(socialNotification.type, type), eq(socialNotification.subjectId, subjectId)));
}

/** Both directions: what A got about B and what B got about A. */
export async function deleteNotificationsBetween(tx: Tx, a: string, b: string): Promise<void> {
	await tx
		.delete(socialNotification)
		.where(
			or(
				and(eq(socialNotification.recipientId, a), eq(socialNotification.actorId, b)),
				and(eq(socialNotification.recipientId, b), eq(socialNotification.actorId, a)),
			),
		);
}

function expiredCondition(now: Date): SQL {
	const readCutoff = new Date(now.getTime() - INBOX_READ_RETENTION_DAYS * DAY_MS);
	const ageCutoff = new Date(now.getTime() - INBOX_MAX_AGE_DAYS * DAY_MS);
	// `read_at < x` is NULL for unread rows, and NOT NULL would hide them, so
	// the null case is spelled out.
	return or(
		lt(socialNotification.createdAt, ageCutoff),
		and(isNotNull(socialNotification.readAt), lt(socialNotification.readAt, readCutoff)),
	) as SQL;
}

function friendshipBetweenRecipientAndActor(): SQL {
	return sql`EXISTS (
		SELECT 1 FROM ${socialFriendship}
		WHERE (${socialFriendship.userLow} = ${socialNotification.recipientId} AND ${socialFriendship.userHigh} = ${socialNotification.actorId})
		   OR (${socialFriendship.userLow} = ${socialNotification.actorId} AND ${socialFriendship.userHigh} = ${socialNotification.recipientId})
	)`;
}

/**
 * When a received-request item still has something to show: the request is
 * open, it was declined and the decline is still on record, or the two are
 * friends. Anything else (cancelled, expired, unfriended) is gone.
 */
function liveRequestItem(now: Date): SQL {
	const pendingCutoff = new Date(now.getTime() - FRIEND_REQUEST_TTL_DAYS * DAY_MS);
	return sql`(
		${socialNotification.type} <> 'friend_request_received'
		OR ${friendshipBetweenRecipientAndActor()}
		OR EXISTS (
			SELECT 1 FROM ${socialFriendRequest}
			WHERE ${socialFriendRequest.id}::text = ${socialNotification.subjectId}
			  AND (${socialFriendRequest.state} = 'declined'
			       OR (${socialFriendRequest.state} = 'pending' AND ${socialFriendRequest.createdAt} > ${pendingCutoff.toISOString()}))
		)
	)`;
}

/** A received-share item lives as long as its share record does and the share was not withdrawn. */
function liveShareItem(): SQL {
	return sql`(
		${socialNotification.type} <> 'share_received'
		OR EXISTS (
			SELECT 1 FROM ${socialShare}
			WHERE ${socialShare.id}::text = ${socialNotification.subjectId}
			  AND ${socialShare.status} <> 'revoked'
		)
	)`;
}

/**
 * Buddy-read items live with their subject: an invite until it is cancelled or
 * its read is deleted, a joined or finished item while the recipient is still
 * a member. A member who left stops seeing news about the read.
 */
function liveBuddyReadItem(): SQL {
	return sql`(
		(${socialNotification.type} <> 'buddy_read_invite'
		 OR EXISTS (
			SELECT 1 FROM ${buddyReadInvite}
			WHERE ${buddyReadInvite.id}::text = ${socialNotification.subjectId}
			  AND ${buddyReadInvite.status} <> 'cancelled'
		 ))
		AND (${socialNotification.type} NOT IN ('buddy_read_joined', 'buddy_read_finished')
		 OR EXISTS (
			SELECT 1 FROM ${buddyReadMember}
			WHERE ${buddyReadMember.buddyReadId}::text = ${socialNotification.subjectId}
			  AND ${buddyReadMember.userId} = ${socialNotification.recipientId}
			  AND ${buddyReadMember.state} = 'active'
		 ))
	)`;
}

/** No scheduler: a recipient's expired and gone rows go when they next touch their inbox. */
async function purgeExpired(exec: DbExecutor, userId: string, now: Date): Promise<void> {
	await exec
		.delete(socialNotification)
		.where(
			and(
				eq(socialNotification.recipientId, userId),
				or(
					expiredCondition(now),
					not(liveRequestItem(now)),
					not(liveShareItem()),
					not(liveBuddyReadItem()),
				),
			),
		);
}

function blockBetweenRecipientAndActor(): SQL {
	return sql`NOT EXISTS (
		SELECT 1 FROM ${socialBlock}
		WHERE (${socialBlock.blockerId} = ${socialNotification.recipientId} AND ${socialBlock.blockedId} = ${socialNotification.actorId})
		   OR (${socialBlock.blockerId} = ${socialNotification.actorId} AND ${socialBlock.blockedId} = ${socialNotification.recipientId})
	)`;
}

/**
 * What makes an item visible to its recipient beyond ownership: live actor
 * identity and subject, no block, not expired. Items from Lesefluss itself have
 * no actor and skip the actor checks.
 */
function visibleItems(userId: string, now: Date): SQL {
	return and(
		eq(socialNotification.recipientId, userId),
		sql`NOT (${expiredCondition(now)})`,
		liveRequestItem(now),
		liveShareItem(),
		liveBuddyReadItem(),
		or(
			isNull(socialNotification.actorId),
			and(
				blockBetweenRecipientAndActor(),
				sql`${socialProfile.handle} IS NOT NULL`,
				sql`(${user.banned} IS NOT TRUE OR ${user.banExpires} <= ${now})`,
			),
		),
	) as SQL;
}

type Cursor = { createdAt: number; id: string };

function encodeCursor(c: Cursor): string {
	return Buffer.from(`${c.createdAt}:${c.id}`).toString("base64url");
}

function decodeCursor(raw: string | null | undefined): Cursor | null {
	if (!raw) return null;
	const [createdAt, id] = Buffer.from(raw, "base64url").toString().split(":");
	const ms = Number(createdAt);
	return Number.isFinite(ms) && id ? { createdAt: ms, id } : null;
}

/** Only rows that passed `liveRequestItem` get here, so nothing is "gone". */
function requestState(row: {
	requestState: string | null;
	isFriend: boolean;
}): FriendRequestItemState {
	if (row.isFriend) return "accepted";
	return row.requestState === "declined" ? "declined" : "pending";
}

export async function listInbox(
	userId: string,
	cursor: string | null,
	now = new Date(),
	limit = INBOX_PAGE_SIZE,
): Promise<InboxPage> {
	await purgeExpired(db, userId, now);
	const after = decodeCursor(cursor);
	const rows = await db
		.select({
			id: socialNotification.id,
			type: socialNotification.type,
			subjectId: socialNotification.subjectId,
			createdAt: socialNotification.createdAt,
			readAt: socialNotification.readAt,
			payload: socialNotification.payload,
			actorId: user.id,
			actorName: user.name,
			actorHandle: socialProfile.handle,
			actorAvatarId: socialAvatar.id,
			requestState: socialFriendRequest.state,
			isFriend: friendshipBetweenRecipientAndActor(),
		})
		.from(socialNotification)
		.leftJoin(user, eq(user.id, socialNotification.actorId))
		.leftJoin(socialProfile, eq(socialProfile.userId, user.id))
		.leftJoin(socialAvatar, eq(socialAvatar.userId, user.id))
		.leftJoin(
			socialFriendRequest,
			and(
				eq(socialNotification.type, "friend_request_received"),
				sql`${socialFriendRequest.id}::text = ${socialNotification.subjectId}`,
			),
		)
		.where(
			and(
				visibleItems(userId, now),
				after
					? or(
							lt(socialNotification.createdAt, new Date(after.createdAt)),
							and(
								eq(socialNotification.createdAt, new Date(after.createdAt)),
								lt(socialNotification.id, after.id),
							),
						)
					: undefined,
			),
		)
		.orderBy(desc(socialNotification.createdAt), desc(socialNotification.id))
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	const shareSubjects = await shareSubjectsFor(
		db,
		userId,
		page.filter((r) => r.type === "share_received").map((r) => r.subjectId),
		now,
	);
	const inviteSubjects = await buddyReadInviteSubjectsFor(
		db,
		userId,
		page.filter((r) => r.type === "buddy_read_invite").map((r) => r.subjectId),
		now,
	);
	const items: InboxItem[] = [];
	for (const row of page) {
		let subject: InboxItem["subject"] = null;
		if (row.type === "friend_request_received") {
			subject = {
				kind: "friend_request",
				requestId: row.subjectId,
				state: requestState({ requestState: row.requestState, isFriend: Boolean(row.isFriend) }),
			};
		} else if (row.type === "share_received") {
			subject = shareSubjects.get(row.subjectId) ?? null;
		} else if (row.type === "buddy_read_invite") {
			subject = inviteSubjects.get(row.subjectId) ?? null;
		}
		items.push({
			id: row.id,
			type: row.type,
			createdAt: row.createdAt.getTime(),
			readAt: row.readAt?.getTime() ?? null,
			actor:
				row.actorId && row.actorName !== null
					? {
							userId: row.actorId,
							handle: row.actorHandle ?? "",
							name: row.actorName,
							avatarUrl: avatarUrlFor(row.actorAvatarId),
						}
					: null,
			subject,
			payload: row.payload ?? null,
		});
	}
	const last = page[page.length - 1];
	return {
		items,
		nextCursor:
			rows.length > limit && last
				? encodeCursor({ createdAt: last.createdAt.getTime(), id: last.id })
				: null,
	};
}

export async function unreadCount(userId: string, now = new Date()): Promise<number> {
	await purgeExpired(db, userId, now);
	const [row] = await db
		.select({ n: count() })
		.from(socialNotification)
		.leftJoin(user, eq(user.id, socialNotification.actorId))
		.leftJoin(socialProfile, eq(socialProfile.userId, user.id))
		.where(and(visibleItems(userId, now), isNull(socialNotification.readAt)));
	return row?.n ?? 0;
}

/** The recipient acted on the subject elsewhere, so its item no longer needs attention. */
export async function markSubjectRead(
	tx: Tx,
	type: NotificationType,
	subjectId: string,
	now = new Date(),
): Promise<void> {
	await tx
		.update(socialNotification)
		.set({ readAt: now })
		.where(
			and(
				eq(socialNotification.type, type),
				eq(socialNotification.subjectId, subjectId),
				isNull(socialNotification.readAt),
			),
		);
}

/** A foreign or unknown id changes nothing and reports nothing. */
export async function markRead(userId: string, id: string, now = new Date()): Promise<void> {
	await db
		.update(socialNotification)
		.set({ readAt: now })
		.where(
			and(
				eq(socialNotification.id, id),
				eq(socialNotification.recipientId, userId),
				isNull(socialNotification.readAt),
			),
		);
}

export async function markAllRead(userId: string, now = new Date()): Promise<void> {
	await db
		.update(socialNotification)
		.set({ readAt: now })
		.where(and(eq(socialNotification.recipientId, userId), isNull(socialNotification.readAt)));
}
