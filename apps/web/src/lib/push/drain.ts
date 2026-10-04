import { and, asc, count, eq, gt, inArray, lt, lte } from "drizzle-orm";
import { db } from "~/db";
import { session } from "~/db/auth-schema";
import {
	type SocialPushOutboxRow,
	socialPushOutbox,
	socialPushSent,
	socialPushToken,
} from "~/db/schema";
import { composePush } from "./compose";
import { createFcmSender, type PushSender, readServiceAccount } from "./fcm";

const DRAIN_INTERVAL_MS = 10_000;
const DRAIN_BATCH_SIZE = 50;
const RETRY_DELAY_MS = 60_000;
const HOUR_MS = 60 * 60_000;
export const PUSH_MAX_AGE_MS = 24 * HOUR_MS;
export const PUSH_RECIPIENT_HOURLY_CAP = 20;
export const PUSH_PAIR_HOURLY_CAP = 5;

/**
 * Long enough for a full batch to time out against FCM; a row claimed by a
 * process that died comes back once its lease runs out.
 */
const CLAIM_LEASE_MS = 15 * 60_000;

/**
 * Sends every due push once. A short transaction leases the due rows by moving
 * `send_after` past the sends, so other instances skip them and no lock is
 * held while FCM answers. A process that dies after a send but before the
 * delete sends that row again after the lease; the per-subject tag makes the
 * device replace it rather than show it twice.
 */
export async function drainPushOutbox(send: PushSender, now = new Date()): Promise<void> {
	const leaseUntil = new Date(now.getTime() + CLAIM_LEASE_MS);
	const claimed = await db.transaction(async (tx) => {
		const due = await tx
			.select()
			.from(socialPushOutbox)
			.where(lte(socialPushOutbox.sendAfter, now))
			.orderBy(asc(socialPushOutbox.sendAfter))
			.limit(DRAIN_BATCH_SIZE)
			.for("update", { skipLocked: true });
		if (due.length > 0) {
			await tx
				.update(socialPushOutbox)
				.set({ sendAfter: leaseUntil })
				.where(
					inArray(
						socialPushOutbox.id,
						due.map((r) => r.id),
					),
				);
		}
		return due;
	});
	for (const row of claimed) {
		// A repeated event since the claim moved `send_after`; that row is due again, not done.
		const isStillLeased = and(
			eq(socialPushOutbox.id, row.id),
			eq(socialPushOutbox.sendAfter, leaseUntil),
		);
		try {
			if (await deliver(row, send, now)) {
				await db.delete(socialPushOutbox).where(isStillLeased);
				continue;
			}
		} catch (error) {
			console.error("push: delivering a queued push failed", error);
		}
		await db
			.update(socialPushOutbox)
			.set({ sendAfter: new Date(now.getTime() + RETRY_DELAY_MS) })
			.where(isStillLeased);
	}
	await db
		.delete(socialPushSent)
		.where(lt(socialPushSent.sentAt, new Date(now.getTime() - HOUR_MS)));
	await db
		.delete(socialPushToken)
		.where(
			inArray(
				socialPushToken.sessionId,
				db.select({ id: session.id }).from(session).where(lte(session.expiresAt, now)),
			),
		);
}

/** True when the row is finished with, sent or dropped; false to retry it later. */
async function deliver(row: SocialPushOutboxRow, send: PushSender, now: Date): Promise<boolean> {
	if (now.getTime() - row.createdAt.getTime() > PUSH_MAX_AGE_MS) return true;
	if (await isOverHourlyCap(row, now)) return true;
	const tokens = await liveTokensOf(row.recipientId, now);
	if (tokens.length === 0) return true;
	const message = await composePush(db, row, now);
	if (!message) return true;
	const results = await Promise.all(tokens.map((t) => send(t.token, t.platform, message)));
	const invalid = tokens.filter((_, i) => results[i] === "invalid_token").map((t) => t.token);
	if (invalid.length > 0) {
		await db.delete(socialPushToken).where(inArray(socialPushToken.token, invalid));
	}
	if (results.includes("sent")) {
		await db
			.insert(socialPushSent)
			.values({ recipientId: row.recipientId, actorId: row.actorId, sentAt: now });
		return true;
	}
	return !results.includes("failed");
}

async function isOverHourlyCap(row: SocialPushOutboxRow, now: Date): Promise<boolean> {
	const since = new Date(now.getTime() - HOUR_MS);
	const recent = and(
		eq(socialPushSent.recipientId, row.recipientId),
		gt(socialPushSent.sentAt, since),
	);
	const [toRecipient] = await db.select({ n: count() }).from(socialPushSent).where(recent);
	if ((toRecipient?.n ?? 0) >= PUSH_RECIPIENT_HOURLY_CAP) return true;
	const [fromActor] = await db
		.select({ n: count() })
		.from(socialPushSent)
		.where(and(recent, eq(socialPushSent.actorId, row.actorId)));
	return (fromActor?.n ?? 0) >= PUSH_PAIR_HOURLY_CAP;
}

/** Expired sessions are swept each tick; filtering here covers the time in between. */
async function liveTokensOf(userId: string, now: Date) {
	return db
		.select({ token: socialPushToken.token, platform: socialPushToken.platform })
		.from(socialPushToken)
		.innerJoin(session, eq(session.id, socialPushToken.sessionId))
		.where(and(eq(socialPushToken.userId, userId), gt(session.expiresAt, now)));
}

let drainer: ReturnType<typeof setInterval> | null = null;

/** One loop per server process; a no-op without push credentials. */
export function startPushDrainer(): void {
	if (drainer) return;
	const account = readServiceAccount();
	if (!account) return;
	const send = createFcmSender(account);
	let isDraining = false;
	drainer = setInterval(() => {
		if (isDraining) return;
		isDraining = true;
		drainPushOutbox(send)
			.catch((error) => console.error("push: drain failed", error))
			.finally(() => {
				isDraining = false;
			});
	}, DRAIN_INTERVAL_MS);
	drainer.unref?.();
}
