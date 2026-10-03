import {
	DECLINE_COOLDOWN_DAYS,
	FRIEND_REQUEST_TTL_DAYS,
	MAX_FRIENDS,
	MAX_PENDING_OUTGOING_REQUESTS,
	type RelationshipState,
	type RespondToRequestBody,
	type SocialRelationships,
} from "@lesefluss/core";
import { and, count, eq, gt, inArray, lt, or } from "drizzle-orm";
import { type DbExecutor, db, type Tx } from "~/db";
import { user } from "~/db/auth-schema";
import {
	type SocialFriendRequest,
	socialBlock,
	socialFriendRequest,
	socialFriendship,
} from "~/db/schema";
import { sharesActiveBuddyRead } from "./buddy-read-eligibility";
import { SocialError } from "./errors";
import { runHooks, socialHooks } from "./hooks";
// The inbox listens to the events emitted below; importing it here makes sure
// it is registered before the first event fires.
import "./inbox-hooks";
import { nowReadingFor } from "./profile-view";
import {
	canInteract,
	friendshipExists,
	identityOf,
	isSociallyVisible,
	loadSocialUsers,
	orderedPair,
} from "./relationship";

const DAY_MS = 86_400_000;

function requestCutoff(now: Date): Date {
	return new Date(now.getTime() - FRIEND_REQUEST_TTL_DAYS * DAY_MS);
}

function cooldownCutoff(now: Date): Date {
	return new Date(now.getTime() - DECLINE_COOLDOWN_DAYS * DAY_MS);
}

function betweenPair(a: string, b: string) {
	return or(
		and(eq(socialFriendRequest.requesterId, a), eq(socialFriendRequest.addresseeId, b)),
		and(eq(socialFriendRequest.requesterId, b), eq(socialFriendRequest.addresseeId, a)),
	);
}

/** Locks the user rows in id order so every writer touching a pair serialises the same way. */
export async function lockUsers(tx: Tx, ...ids: string[]): Promise<void> {
	for (const id of [...new Set(ids)].sort()) {
		await tx.select({ id: user.id }).from(user).where(eq(user.id, id)).for("update");
	}
}

/** Drops request rows of this pair the privacy policy no longer lets us keep. */
async function cleanupPair(tx: Tx, a: string, b: string, now: Date): Promise<void> {
	await tx
		.delete(socialFriendRequest)
		.where(
			and(
				betweenPair(a, b),
				or(
					inArray(socialFriendRequest.state, ["accepted", "cancelled"]),
					and(
						eq(socialFriendRequest.state, "pending"),
						lt(socialFriendRequest.createdAt, requestCutoff(now)),
					),
					and(
						eq(socialFriendRequest.state, "declined"),
						lt(socialFriendRequest.resolvedAt, cooldownCutoff(now)),
					),
				),
			),
		);
}

async function friendCount(exec: DbExecutor, userId: string): Promise<number> {
	const [row] = await exec
		.select({ n: count() })
		.from(socialFriendship)
		.where(or(eq(socialFriendship.userLow, userId), eq(socialFriendship.userHigh, userId)));
	return row?.n ?? 0;
}

/**
 * The one place a friendship is written: accept, mutual auto-accept and invite
 * redemption all end here. Re-checks blocks inside the transaction so a block
 * racing an accept wins, and the pair PK makes a repeated accept a no-op.
 */
export async function createFriendship(tx: Tx, a: string, b: string, now: Date): Promise<void> {
	if (!(await canInteract(tx, a, b, now))) throw new SocialError("not_found");
	if ((await friendCount(tx, a)) >= MAX_FRIENDS || (await friendCount(tx, b)) >= MAX_FRIENDS) {
		throw new SocialError("limit_reached");
	}
	const [low, high] = orderedPair(a, b);
	const inserted = await tx
		.insert(socialFriendship)
		.values({ userLow: low, userHigh: high, acceptedAt: now })
		.onConflictDoNothing()
		.returning({ userLow: socialFriendship.userLow });
	const pending = await tx
		.update(socialFriendRequest)
		.set({ state: "accepted", resolvedAt: now })
		.where(and(betweenPair(a, b), eq(socialFriendRequest.state, "pending")))
		.returning();
	for (const request of pending)
		await runHooks(socialHooks.onRequestRemoved, tx, request, "accepted");
	if (inserted.length > 0) await runHooks(socialHooks.onFriendshipCreated, tx, low, high);
}

export async function sendFriendRequest(
	me: string,
	targetId: string,
	now = new Date(),
): Promise<RelationshipState> {
	return db.transaction(async (tx) => {
		await lockUsers(tx, me, targetId);
		if (!(await canInteract(tx, me, targetId, now))) throw new SocialError("not_found");
		await cleanupPair(tx, me, targetId, now);
		if (await friendshipExists(tx, me, targetId)) return "friends";

		const rows = await tx.select().from(socialFriendRequest).where(betweenPair(me, targetId));
		const theirs = rows.find((r) => r.requesterId === targetId && r.state === "pending");
		if (theirs) {
			await createFriendship(tx, me, targetId, now);
			return "friends";
		}
		const mine = rows.find((r) => r.requesterId === me);
		if (mine?.state === "pending") return "pending_outgoing";
		if (mine?.state === "declined") {
			// Inside the decline cooldown: the sender sees a fresh "pending", the
			// addressee is not bothered again.
			await tx
				.update(socialFriendRequest)
				.set({ createdAt: now })
				.where(eq(socialFriendRequest.id, mine.id));
			return "pending_outgoing";
		}

		// Only a genuinely new request needs the shared buddy read; an existing
		// relationship stays reportable after the buddy read has ended.
		if (!(await sharesActiveBuddyRead(tx, me, targetId, now))) throw new SocialError("not_found");
		const [outgoing] = await tx
			.select({ n: count() })
			.from(socialFriendRequest)
			.where(
				and(
					eq(socialFriendRequest.requesterId, me),
					eq(socialFriendRequest.state, "pending"),
					gt(socialFriendRequest.createdAt, requestCutoff(now)),
				),
			);
		if ((outgoing?.n ?? 0) >= MAX_PENDING_OUTGOING_REQUESTS) throw new SocialError("limit_reached");

		const [request] = await tx
			.insert(socialFriendRequest)
			.values({ requesterId: me, addresseeId: targetId, state: "pending", createdAt: now })
			.returning();
		if (request) await runHooks(socialHooks.onRequestCreated, tx, request);
		return "pending_outgoing";
	});
}

async function loadPendingIncoming(
	tx: Tx,
	me: string,
	requestId: string,
	now: Date,
): Promise<SocialFriendRequest | undefined> {
	const [row] = await tx
		.select()
		.from(socialFriendRequest)
		.where(
			and(
				eq(socialFriendRequest.id, requestId),
				eq(socialFriendRequest.addresseeId, me),
				eq(socialFriendRequest.state, "pending"),
				gt(socialFriendRequest.createdAt, requestCutoff(now)),
			),
		);
	return row;
}

export type RespondAction = RespondToRequestBody["action"];

export async function respondToRequest(
	me: string,
	requestId: string,
	action: RespondAction,
	now = new Date(),
): Promise<RelationshipState> {
	return db.transaction(async (tx) => {
		const peek = await loadPendingIncoming(tx, me, requestId, now);
		if (!peek) throw new SocialError("not_found");
		await lockUsers(tx, me, peek.requesterId);
		const request = await loadPendingIncoming(tx, me, requestId, now);
		if (!request) throw new SocialError("not_found");

		if (action === "accept") {
			await createFriendship(tx, request.requesterId, me, now);
			return "friends";
		}
		const declined = await tx
			.update(socialFriendRequest)
			.set({ state: "declined", resolvedAt: now })
			.where(and(eq(socialFriendRequest.id, request.id), eq(socialFriendRequest.state, "pending")))
			.returning({ id: socialFriendRequest.id });
		if (declined.length === 0) throw new SocialError("not_found");
		await runHooks(socialHooks.onRequestRemoved, tx, request, "declined");
		if (action === "decline_block") await blockWithin(tx, me, request.requesterId, now);
		return "none";
	});
}

export async function cancelRequest(
	me: string,
	requestId: string,
	now = new Date(),
): Promise<void> {
	await db.transaction(async (tx) => {
		const [peek] = await tx
			.select({ addresseeId: socialFriendRequest.addresseeId })
			.from(socialFriendRequest)
			.where(and(eq(socialFriendRequest.id, requestId), eq(socialFriendRequest.requesterId, me)));
		if (!peek) throw new SocialError("not_found");
		await lockUsers(tx, me, peek.addresseeId);
		const [request] = await tx
			.delete(socialFriendRequest)
			.where(
				and(
					eq(socialFriendRequest.id, requestId),
					eq(socialFriendRequest.requesterId, me),
					inArray(socialFriendRequest.state, ["pending", "declined"]),
				),
			)
			.returning();
		if (!request) throw new SocialError("not_found");
		if (request.state === "pending" && request.createdAt > requestCutoff(now)) {
			await runHooks(socialHooks.onRequestRemoved, tx, request, "cancelled");
		}
	});
}

async function deleteFriendship(tx: Tx, a: string, b: string): Promise<boolean> {
	const [low, high] = orderedPair(a, b);
	const removed = await tx
		.delete(socialFriendship)
		.where(and(eq(socialFriendship.userLow, low), eq(socialFriendship.userHigh, high)))
		.returning({ userLow: socialFriendship.userLow });
	return removed.length > 0;
}

export async function removeFriend(me: string, otherId: string): Promise<void> {
	await db.transaction(async (tx) => {
		await lockUsers(tx, me, otherId);
		if (!(await deleteFriendship(tx, me, otherId))) throw new SocialError("not_found");
		await tx.delete(socialFriendRequest).where(betweenPair(me, otherId));
		await runHooks(socialHooks.onFriendshipRemoved, tx, me, otherId, "removed");
	});
}

async function blockWithin(tx: Tx, me: string, targetId: string, now: Date): Promise<void> {
	const inserted = await tx
		.insert(socialBlock)
		.values({ blockerId: me, blockedId: targetId, createdAt: now })
		.onConflictDoNothing()
		.returning({ blockerId: socialBlock.blockerId });
	if (inserted.length > 0) await runHooks(socialHooks.onBlock, tx, me, targetId);
	if (await deleteFriendship(tx, me, targetId)) {
		await runHooks(socialHooks.onFriendshipRemoved, tx, me, targetId, "blocked");
	}
	const requests = await tx
		.delete(socialFriendRequest)
		.where(betweenPair(me, targetId))
		.returning();
	for (const request of requests) {
		if (request.state === "pending" && request.createdAt > requestCutoff(now)) {
			await runHooks(socialHooks.onRequestRemoved, tx, request, "blocked");
		}
	}
}

/** Blocks someone the caller currently encounters: a friend, a request counterpart or a buddy-read co-participant. */
export async function blockUser(me: string, targetId: string, now = new Date()): Promise<void> {
	await db.transaction(async (tx) => {
		await lockUsers(tx, me, targetId);
		if (me === targetId) throw new SocialError("not_found");
		const [alreadyBlocked] = await tx
			.select({ blockerId: socialBlock.blockerId })
			.from(socialBlock)
			.where(and(eq(socialBlock.blockerId, me), eq(socialBlock.blockedId, targetId)));
		if (alreadyBlocked) return;
		const users = await loadSocialUsers(tx, [targetId]);
		const target = users.get(targetId);
		if (!target || !isSociallyVisible(target, now)) throw new SocialError("not_found");
		const encountered =
			(await friendshipExists(tx, me, targetId)) ||
			(
				await tx
					.select({ id: socialFriendRequest.id })
					.from(socialFriendRequest)
					.where(betweenPair(me, targetId))
					.limit(1)
			).length > 0 ||
			(await sharesActiveBuddyRead(tx, me, targetId, now));
		if (!encountered) throw new SocialError("not_found");
		await blockWithin(tx, me, targetId, now);
	});
}

export async function unblockUser(me: string, targetId: string): Promise<void> {
	const removed = await db
		.delete(socialBlock)
		.where(and(eq(socialBlock.blockerId, me), eq(socialBlock.blockedId, targetId)))
		.returning({ blockerId: socialBlock.blockerId });
	if (removed.length === 0) throw new SocialError("not_found");
}

export async function listRelationships(
	me: string,
	now = new Date(),
): Promise<SocialRelationships> {
	const cutoff = requestCutoff(now);
	const [friendships, incoming, outgoing, blocks] = await Promise.all([
		db
			.select()
			.from(socialFriendship)
			.where(or(eq(socialFriendship.userLow, me), eq(socialFriendship.userHigh, me))),
		db
			.select()
			.from(socialFriendRequest)
			.where(
				and(
					eq(socialFriendRequest.addresseeId, me),
					eq(socialFriendRequest.state, "pending"),
					gt(socialFriendRequest.createdAt, cutoff),
				),
			),
		// Declined rows are included on purpose: the sender must not be able to
		// tell a decline from a request still waiting.
		db
			.select()
			.from(socialFriendRequest)
			.where(
				and(
					eq(socialFriendRequest.requesterId, me),
					inArray(socialFriendRequest.state, ["pending", "declined"]),
					gt(socialFriendRequest.createdAt, cutoff),
				),
			),
		db.select().from(socialBlock).where(eq(socialBlock.blockerId, me)),
	]);
	const friendIds = friendships.map((f) => (f.userLow === me ? f.userHigh : f.userLow));
	const users = await loadSocialUsers(db, [
		...friendIds,
		...incoming.map((r) => r.requesterId),
		...outgoing.map((r) => r.addresseeId),
		...blocks.map((b) => b.blockedId),
	]);
	const visible = (id: string) => {
		const u = users.get(id);
		return u && isSociallyVisible(u, now) ? u : null;
	};
	const nowReading = await nowReadingFor(
		db,
		me,
		friendIds.filter((id) => visible(id)),
	);
	return {
		friends: friendships.flatMap((f) => {
			const u = visible(f.userLow === me ? f.userHigh : f.userLow);
			return u
				? [
						{
							...identityOf(u),
							since: f.acceptedAt.getTime(),
							nowReading: nowReading.get(u.id) ?? null,
						},
					]
				: [];
		}),
		incoming: incoming.flatMap((r) => {
			const u = visible(r.requesterId);
			return u ? [{ ...identityOf(u), requestId: r.id, sentAt: r.createdAt.getTime() }] : [];
		}),
		outgoing: outgoing.flatMap((r) => {
			const u = visible(r.addresseeId);
			return u ? [{ ...identityOf(u), requestId: r.id, sentAt: r.createdAt.getTime() }] : [];
		}),
		// A blocked user stays listed while banned so the blocker can still unblock.
		blocked: blocks.flatMap((b) => {
			const u = users.get(b.blockedId);
			return u?.handle ? [identityOf(u)] : [];
		}),
	};
}
