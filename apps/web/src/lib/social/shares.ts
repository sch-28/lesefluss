import {
	type OutgoingShare,
	SHARE_DAILY_LIMIT,
	SHARE_RECORD_RETENTION_DAYS,
	SHARE_TTL_DAYS,
	type ShareBody,
} from "@lesefluss/core";
import { and, count, eq, gt, inArray, lt, or, type SQL } from "drizzle-orm";
import { type DbExecutor, db, type Tx } from "~/db";
import { type SocialShare, socialShare, socialShareConsent } from "~/db/schema";
import { isSharingSuspended } from "~/lib/moderation/restrictions";
import { isOriginTakenDown } from "~/lib/moderation/takedown";
import { copyBookForUser, shareableSource } from "./copy-book";
import { SocialError } from "./errors";
import { createNotification, deleteNotificationsForSubject, markSubjectRead } from "./inbox";
import { areFriends, identityOf, isSociallyVisible, loadSocialUsers } from "./relationship";
import { isShareExpired, shareExpiryCutoff } from "./share-items";
import "./share-hooks";

const DAY_MS = 86_400_000;

/** Records the sender no longer needs: resolved long ago, or pending so long they expired long ago. */
async function purgeOldShares(exec: DbExecutor, senderId: string, now: Date): Promise<void> {
	const cutoff = new Date(now.getTime() - SHARE_RECORD_RETENTION_DAYS * DAY_MS);
	const expiredCutoff = new Date(cutoff.getTime() - SHARE_TTL_DAYS * DAY_MS);
	await exec
		.delete(socialShare)
		.where(
			and(
				eq(socialShare.senderId, senderId),
				or(
					and(
						inArray(socialShare.status, ["declined", "expired", "revoked", "accepted"]),
						lt(socialShare.resolvedAt, cutoff),
					),
					and(eq(socialShare.status, "pending"), lt(socialShare.createdAt, expiredCutoff)),
				),
			),
		);
}

async function hasConsent(exec: DbExecutor, userId: string): Promise<boolean> {
	const rows = await exec
		.select({ userId: socialShareConsent.userId })
		.from(socialShareConsent)
		.where(eq(socialShareConsent.userId, userId));
	return rows.length > 0;
}

/**
 * Offers one synced book to one friend. Every refusal has its own code so the
 * app can say why; the recipient learns nothing until the item lands in their
 * inbox.
 */
export async function createShare(
	senderId: string,
	body: ShareBody,
	now = new Date(),
): Promise<{ shareId: string }> {
	// Outside the transaction: a refused share must not roll the housekeeping back.
	await purgeOldShares(db, senderId, now);
	return db.transaction(async (tx) => {
		if (!(await areFriends(tx, senderId, body.recipientId, now))) {
			throw new SocialError("not_found");
		}
		if (await isSharingSuspended(senderId, now, tx)) throw new SocialError("suspended");
		const source = await shareableSource(tx, senderId, body.bookId);
		if (!source || (await isOriginTakenDown(source.originUserId, source.originBookId, tx))) {
			throw new SocialError("not_shareable");
		}
		// A never-answered offer keeps its `pending` status until something looks
		// at it; here that would collide with the pending-only unique index.
		await tx
			.update(socialShare)
			.set({ status: "expired", resolvedAt: now })
			.where(
				and(
					eq(socialShare.senderId, senderId),
					eq(socialShare.recipientId, body.recipientId),
					eq(socialShare.originUserId, source.originUserId),
					eq(socialShare.originBookId, source.originBookId),
					eq(socialShare.status, "pending"),
					lt(socialShare.createdAt, shareExpiryCutoff(now)),
				),
			);
		// One offer per recipient and origin per 30 days unless it was withdrawn
		// while open: pending, declined and closed-early declines all count.
		const [existing] = await tx
			.select({ id: socialShare.id })
			.from(socialShare)
			.where(
				and(
					eq(socialShare.senderId, senderId),
					eq(socialShare.recipientId, body.recipientId),
					eq(socialShare.originUserId, source.originUserId),
					eq(socialShare.originBookId, source.originBookId),
					inArray(socialShare.status, ["pending", "declined", "expired"]),
					gt(socialShare.createdAt, shareExpiryCutoff(now)),
				),
			);
		if (existing) throw new SocialError("already_shared");
		const [recent] = await tx
			.select({ n: count() })
			.from(socialShare)
			.where(
				and(
					eq(socialShare.senderId, senderId),
					gt(socialShare.createdAt, new Date(now.getTime() - DAY_MS)),
				),
			);
		if ((recent?.n ?? 0) >= SHARE_DAILY_LIMIT) throw new SocialError("limit_reached");
		if (!(await hasConsent(tx, senderId))) {
			if (!body.confirmRights) throw new SocialError("consent_required");
			await tx.insert(socialShareConsent).values({ userId: senderId, confirmedAt: now });
		}

		const [share] = await tx
			.insert(socialShare)
			.values({
				senderId,
				recipientId: body.recipientId,
				bookId: body.bookId,
				originUserId: source.originUserId,
				originBookId: source.originBookId,
				title: source.title,
				author: source.author,
				wordCount: source.wordCount,
				createdAt: now,
			})
			.returning({ id: socialShare.id });
		if (!share) throw new Error("share insert returned nothing");
		await createNotification(
			tx,
			{
				recipientId: body.recipientId,
				actorId: senderId,
				type: "share_received",
				subjectId: share.id,
			},
			now,
		);
		return { shareId: share.id };
	});
}

/**
 * Open shares of one book, for the sender's book page. A declined share is
 * listed like a pending one until it would have expired: the decline is the
 * recipient's secret, so the sender sees "waiting", then "not accepted".
 */
export async function listSharesForBook(
	senderId: string,
	bookId: string,
	now = new Date(),
): Promise<OutgoingShare[]> {
	const shares = await db
		.select()
		.from(socialShare)
		.where(
			and(
				eq(socialShare.senderId, senderId),
				eq(socialShare.bookId, bookId),
				inArray(socialShare.status, ["pending", "declined"]),
			),
		)
		.orderBy(socialShare.createdAt);
	const users = await loadSocialUsers(
		db,
		shares.map((s) => s.recipientId),
	);
	const out: OutgoingShare[] = [];
	for (const share of shares) {
		const recipient = users.get(share.recipientId);
		if (!recipient || !isSociallyVisible(recipient, now)) continue;
		out.push({
			shareId: share.id,
			recipient: identityOf(recipient),
			state: isShareExpired(share, now) ? "expired" : "pending",
			createdAt: share.createdAt.getTime(),
		});
	}
	return out;
}

/**
 * The sender withdraws an offer they still see as open. A declined one goes
 * the same way for them, but closes as `expired` rather than `revoked` so the
 * decline's cooldown stays in force.
 */
export async function revokeShare(
	senderId: string,
	shareId: string,
	now = new Date(),
): Promise<void> {
	await db.transaction(async (tx) => {
		const [share] = await tx
			.select({ status: socialShare.status })
			.from(socialShare)
			.where(and(eq(socialShare.id, shareId), eq(socialShare.senderId, senderId)))
			.for("update");
		if (!share || (share.status !== "pending" && share.status !== "declined")) {
			throw new SocialError("not_found");
		}
		await tx
			.update(socialShare)
			.set({ status: share.status === "pending" ? "revoked" : "expired", resolvedAt: now })
			.where(eq(socialShare.id, shareId));
		if (share.status === "pending")
			await deleteNotificationsForSubject(tx, "share_received", shareId);
	});
}

/** Pending shares between two users end when the friendship does; used by the unfriend and block hooks. */
export async function revokePendingSharesBetween(tx: Tx, a: string, b: string, now: Date) {
	await revokeShares(
		tx,
		and(
			eq(socialShare.status, "pending"),
			or(
				and(eq(socialShare.senderId, a), eq(socialShare.recipientId, b)),
				and(eq(socialShare.senderId, b), eq(socialShare.recipientId, a)),
			),
		),
		now,
	);
}

export async function revokeShares(
	tx: Tx,
	where: SQL | undefined,
	now: Date,
): Promise<SocialShare[]> {
	const revoked = await tx
		.update(socialShare)
		.set({ status: "revoked", resolvedAt: now })
		.where(and(eq(socialShare.status, "pending"), where))
		.returning();
	for (const share of revoked) await deleteNotificationsForSubject(tx, "share_received", share.id);
	return revoked;
}

/**
 * Accept copies the book (or links an existing copy) and tells the sender;
 * decline is silent. Both mark the recipient's item read. The re-checks turn
 * every changed circumstance into `unavailable`, never into a reason.
 */
export async function respondToShare(
	recipientId: string,
	shareId: string,
	action: "accept" | "decline",
	now = new Date(),
): Promise<{ bookId: string | null }> {
	return db.transaction(async (tx) => {
		const [share] = await tx
			.select()
			.from(socialShare)
			.where(
				and(
					eq(socialShare.id, shareId),
					eq(socialShare.recipientId, recipientId),
					eq(socialShare.status, "pending"),
				),
			)
			.for("update");
		if (!share || isShareExpired(share, now)) throw new SocialError("not_found");

		if (action === "decline") {
			await tx
				.update(socialShare)
				.set({ status: "declined", resolvedAt: now })
				.where(eq(socialShare.id, share.id));
			await markSubjectRead(tx, "share_received", share.id, now);
			return { bookId: null };
		}

		const [isFriend, suspended, takenDown] = await Promise.all([
			areFriends(tx, share.senderId, recipientId, now),
			isSharingSuspended(share.senderId, now, tx),
			isOriginTakenDown(share.originUserId, share.originBookId, tx),
		]);
		if (!isFriend || suspended || takenDown) throw new SocialError("unavailable");
		const copy = await copyBookForUser(tx, {
			sourceUserId: share.senderId,
			sourceBookId: share.bookId,
			recipientId,
			via: "share",
			now,
		});
		await tx
			.update(socialShare)
			.set({ status: "accepted", resolvedAt: now, copyBookId: copy.bookId })
			.where(eq(socialShare.id, share.id));
		await createNotification(
			tx,
			{
				recipientId: share.senderId,
				actorId: recipientId,
				type: "share_accepted",
				subjectId: share.id,
			},
			now,
		);
		await markSubjectRead(tx, "share_received", share.id, now);
		return { bookId: copy.bookId };
	});
}
