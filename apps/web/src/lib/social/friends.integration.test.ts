// @vitest-environment node
//
// Friend graph against a real Postgres database. Skipped when DATABASE_URL is
// unset so it never breaks `pnpm test`. Run locally with:
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/rsvp pnpm test social/friends
import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { socialBlock, socialFriendRequest, socialFriendship, socialHandle } from "~/db/schema";
import { sharesActiveBuddyRead } from "./buddy-read-eligibility";
import { SocialError } from "./errors";
import {
	blockUser,
	cancelRequest,
	listRelationships,
	removeFriend,
	respondToRequest,
	sendFriendRequest,
	unblockUser,
} from "./friends";
import { claimHandle } from "./handle";
import { areFriends, canInteract } from "./relationship";

vi.mock("./buddy-read-eligibility", () => ({ sharesActiveBuddyRead: vi.fn(async () => true) }));
const eligibility = vi.mocked(sharesActiveBuddyRead);

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY_MS = 86_400_000;

function idOf(row: { id: string } | undefined): string {
	if (!row) throw new Error("expected a request row");
	return row.id;
}

async function expectNotFound(promise: Promise<unknown>) {
	await expect(promise).rejects.toBeInstanceOf(SocialError);
	await expect(promise).rejects.toMatchObject({ code: "not_found" });
}

describe.skipIf(!hasDb)("friend graph (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const ids = {
		alice: `test-fr-a-${run}`,
		bob: `test-fr-b-${run}`,
		carol: `test-fr-c-${run}`,
		noHandle: `test-fr-n-${run}`,
		banned: `test-fr-x-${run}`,
	};
	const all = Object.values(ids);
	const now = new Date();

	beforeAll(async () => {
		await db.insert(user).values(
			all.map((id) => ({
				id,
				name: `Name ${id}`,
				email: `${id}@example.test`,
				banned: id === ids.banned,
			})),
		);
		for (const [key, id] of Object.entries(ids)) {
			if (key === "noHandle") continue;
			await claimHandle(id, `${key}_${run}`, `Name ${key}`);
		}
	});

	afterAll(async () => {
		await db.delete(user).where(inArray(user.id, all));
		const rows = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = rows.map((r) => r.handle).filter((h) => h.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	async function requestsBetween(a: string, b: string) {
		return db
			.select()
			.from(socialFriendRequest)
			.where(
				or(
					and(eq(socialFriendRequest.requesterId, a), eq(socialFriendRequest.addresseeId, b)),
					and(eq(socialFriendRequest.requesterId, b), eq(socialFriendRequest.addresseeId, a)),
				),
			);
	}

	test("canInteract and areFriends gate on existence, handle, ban, self and blocks", async () => {
		expect(await canInteract(db, ids.alice, ids.bob)).toBe(true);
		expect(await canInteract(db, ids.alice, ids.alice)).toBe(false);
		expect(await canInteract(db, ids.alice, "nobody")).toBe(false);
		expect(await canInteract(db, ids.alice, ids.noHandle)).toBe(false);
		expect(await canInteract(db, ids.alice, ids.banned)).toBe(false);
		expect(await areFriends(db, ids.alice, ids.bob)).toBe(false);
	});

	test("a request needs a shared active buddy read and returns one not-found otherwise", async () => {
		eligibility.mockResolvedValueOnce(false);
		await expectNotFound(sendFriendRequest(ids.alice, ids.bob));
		await expectNotFound(sendFriendRequest(ids.alice, ids.alice));
		await expectNotFound(sendFriendRequest(ids.alice, "nobody"));
		await expectNotFound(sendFriendRequest(ids.alice, ids.noHandle));
		await expectNotFound(sendFriendRequest(ids.alice, ids.banned));
		await expectNotFound(sendFriendRequest(ids.noHandle, ids.alice));
	});

	test("request shows as outgoing for A and incoming for B, and a repeat creates nothing", async () => {
		expect(await sendFriendRequest(ids.alice, ids.bob)).toBe("pending_outgoing");
		expect(await sendFriendRequest(ids.alice, ids.bob)).toBe("pending_outgoing");
		expect(await requestsBetween(ids.alice, ids.bob)).toHaveLength(1);
		const a = await listRelationships(ids.alice);
		const b = await listRelationships(ids.bob);
		expect(a.outgoing.map((r) => r.userId)).toEqual([ids.bob]);
		expect(a.outgoing[0]).toMatchObject({ handle: `bob_${run}`, name: "Name bob" });
		expect(a.outgoing[0]).not.toHaveProperty("email");
		expect(b.incoming.map((r) => r.userId)).toEqual([ids.alice]);
	});

	test("an existing relationship is reported even after the shared buddy read ended", async () => {
		// Not `Once`: the gate is not reached for an existing relationship, so a
		// queued one-shot value would leak into the next test.
		eligibility.mockResolvedValue(false);
		expect(await sendFriendRequest(ids.alice, ids.bob)).toBe("pending_outgoing");
		expect(await requestsBetween(ids.alice, ids.bob)).toHaveLength(1);
		eligibility.mockResolvedValue(true);
	});

	test("cancel removes it from B's incoming list", async () => {
		const [request] = await requestsBetween(ids.alice, ids.bob);
		await cancelRequest(ids.alice, idOf(request));
		expect((await listRelationships(ids.bob)).incoming).toHaveLength(0);
		expect((await listRelationships(ids.alice)).outgoing).toHaveLength(0);
		await expectNotFound(cancelRequest(ids.alice, idOf(request)));
	});

	test("decline is silent: A keeps seeing pending until expiry, B never sees a re-request", async () => {
		await sendFriendRequest(ids.alice, ids.bob);
		const [request] = await requestsBetween(ids.alice, ids.bob);
		expect(await respondToRequest(ids.bob, idOf(request), "decline")).toBe("none");
		expect((await listRelationships(ids.bob)).incoming).toHaveLength(0);
		expect((await listRelationships(ids.alice)).outgoing.map((r) => r.userId)).toEqual([ids.bob]);
		// The declined row is not distinguishable from a pending one on A's side.
		const outgoing = (await listRelationships(ids.alice)).outgoing[0];
		expect(Object.keys(outgoing ?? {}).sort()).toEqual(
			["avatarUrl", "handle", "name", "requestId", "sentAt", "userId"].sort(),
		);
		// Expiry: 31 days later A sees nothing.
		const later = new Date(now.getTime() + 31 * DAY_MS);
		expect((await listRelationships(ids.alice, later)).outgoing).toHaveLength(0);
		// Re-request inside the cooldown: accepted, still invisible to B.
		expect(await sendFriendRequest(ids.alice, ids.bob, later)).toBe("pending_outgoing");
		expect((await listRelationships(ids.alice, later)).outgoing).toHaveLength(1);
		expect((await listRelationships(ids.bob, later)).incoming).toHaveLength(0);
		expect(await requestsBetween(ids.alice, ids.bob)).toHaveLength(1);
		// After the cooldown a new request is real again.
		const afterCooldown = new Date(now.getTime() + 92 * DAY_MS);
		expect(await sendFriendRequest(ids.alice, ids.bob, afterCooldown)).toBe("pending_outgoing");
		expect((await listRelationships(ids.bob, afterCooldown)).incoming).toHaveLength(1);
	});

	test("accepting makes both sides friends; a repeated accept is not found", async () => {
		const [request] = await requestsBetween(ids.alice, ids.bob);
		const at = new Date(now.getTime() + 93 * DAY_MS);
		expect(await respondToRequest(ids.bob, idOf(request), "accept", at)).toBe("friends");
		expect(await areFriends(db, ids.alice, ids.bob)).toBe(true);
		expect((await listRelationships(ids.alice)).friends.map((f) => f.userId)).toEqual([ids.bob]);
		expect((await listRelationships(ids.bob)).friends.map((f) => f.userId)).toEqual([ids.alice]);
		await expectNotFound(respondToRequest(ids.bob, idOf(request), "accept", at));
		expect(await sendFriendRequest(ids.alice, ids.bob)).toBe("friends");
	});

	test("removing a friend clears both lists", async () => {
		await removeFriend(ids.bob, ids.alice);
		expect(await areFriends(db, ids.alice, ids.bob)).toBe(false);
		expect((await listRelationships(ids.alice)).friends).toHaveLength(0);
		expect(await requestsBetween(ids.alice, ids.bob)).toHaveLength(0);
		await expectNotFound(removeFriend(ids.bob, ids.alice));
	});

	test("mutual requests, also concurrent, produce exactly one friendship", async () => {
		await sendFriendRequest(ids.alice, ids.carol);
		expect(await sendFriendRequest(ids.carol, ids.alice)).toBe("friends");
		expect(await areFriends(db, ids.alice, ids.carol)).toBe(true);
		await removeFriend(ids.alice, ids.carol);

		const results = await Promise.allSettled([
			sendFriendRequest(ids.alice, ids.carol),
			sendFriendRequest(ids.carol, ids.alice),
		]);
		expect(results.every((r) => r.status === "fulfilled")).toBe(true);
		const rows = await db
			.select()
			.from(socialFriendship)
			.where(
				or(
					and(eq(socialFriendship.userLow, ids.alice), eq(socialFriendship.userHigh, ids.carol)),
					and(eq(socialFriendship.userLow, ids.carol), eq(socialFriendship.userHigh, ids.alice)),
				),
			);
		// The user-row locks serialise the two writers, so the second always sees
		// the first's pending row and auto-accepts.
		const states = results.map((r) => (r as PromiseFulfilledResult<string>).value).sort();
		expect(states).toEqual(["friends", "pending_outgoing"]);
		expect(rows).toHaveLength(1);
		await removeFriend(ids.alice, ids.carol).catch(() => {});
		await db
			.delete(socialFriendRequest)
			.where(
				or(
					eq(socialFriendRequest.requesterId, ids.alice),
					eq(socialFriendRequest.addresseeId, ids.alice),
				),
			);
	});

	test("block removes friendship and requests both ways and hides each side", async () => {
		await sendFriendRequest(ids.alice, ids.bob);
		const [request] = await requestsBetween(ids.alice, ids.bob);
		await respondToRequest(ids.bob, idOf(request), "accept");
		await sendFriendRequest(ids.carol, ids.alice);

		await blockUser(ids.bob, ids.alice);
		expect(await areFriends(db, ids.alice, ids.bob)).toBe(false);
		expect(await canInteract(db, ids.alice, ids.bob)).toBe(false);
		expect(await requestsBetween(ids.alice, ids.bob)).toHaveLength(0);
		expect((await listRelationships(ids.bob)).blocked.map((b) => b.userId)).toEqual([ids.alice]);
		expect((await listRelationships(ids.alice)).blocked).toHaveLength(0);
		// Blocked either way reads as not found for a new request.
		await expectNotFound(sendFriendRequest(ids.alice, ids.bob));
		await expectNotFound(sendFriendRequest(ids.bob, ids.alice));
		// Blocking someone never encountered is not found either.
		await expectNotFound(blockUser(ids.bob, ids.noHandle));
		await expectNotFound(blockUser(ids.bob, ids.banned));
		eligibility.mockResolvedValueOnce(false);
		await expectNotFound(blockUser(ids.bob, ids.carol));
		// Unblock restores nothing.
		await unblockUser(ids.bob, ids.alice);
		expect(await areFriends(db, ids.alice, ids.bob)).toBe(false);
		expect((await listRelationships(ids.bob)).blocked).toHaveLength(0);
		await expectNotFound(unblockUser(ids.bob, ids.alice));
		// Carol's pending request to Alice is untouched by the Bob/Alice block.
		expect((await listRelationships(ids.alice)).incoming.map((r) => r.userId)).toEqual([ids.carol]);
	});

	test("a buddy-read co-participant can be blocked without any friendship or request", async () => {
		await blockUser(ids.carol, ids.bob);
		expect(await canInteract(db, ids.carol, ids.bob)).toBe(false);
		// Re-blocking is a no-op even if the target has since become invisible.
		await db.update(user).set({ banned: true }).where(eq(user.id, ids.bob));
		await blockUser(ids.carol, ids.bob);
		await db.update(user).set({ banned: false }).where(eq(user.id, ids.bob));
		await unblockUser(ids.carol, ids.bob);
	});

	test("decline and block in one action", async () => {
		const [request] = await requestsBetween(ids.carol, ids.alice);
		expect(await respondToRequest(ids.alice, idOf(request), "decline_block")).toBe("none");
		const blocks = await db
			.select()
			.from(socialBlock)
			.where(and(eq(socialBlock.blockerId, ids.alice), eq(socialBlock.blockedId, ids.carol)));
		expect(blocks).toHaveLength(1);
		expect(await requestsBetween(ids.carol, ids.alice)).toHaveLength(0);
		await expectNotFound(sendFriendRequest(ids.carol, ids.alice));
		await unblockUser(ids.alice, ids.carol);
	});

	test("banned users are omitted from request and friend lists", async () => {
		await db.update(user).set({ banned: false }).where(eq(user.id, ids.banned));
		await sendFriendRequest(ids.banned, ids.alice);
		expect((await listRelationships(ids.alice)).incoming.map((r) => r.userId)).toEqual([
			ids.banned,
		]);
		await db.update(user).set({ banned: true }).where(eq(user.id, ids.banned));
		expect((await listRelationships(ids.alice)).incoming).toHaveLength(0);

		await db.update(user).set({ banned: false }).where(eq(user.id, ids.banned));
		const [request] = await requestsBetween(ids.banned, ids.alice);
		await respondToRequest(ids.alice, idOf(request), "accept");
		expect((await listRelationships(ids.alice)).friends.map((f) => f.userId)).toEqual([ids.banned]);
		await db.update(user).set({ banned: true }).where(eq(user.id, ids.banned));
		expect((await listRelationships(ids.alice)).friends).toHaveLength(0);
		expect(await areFriends(db, ids.alice, ids.banned)).toBe(false);
	});
});
