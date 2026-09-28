// @vitest-environment node
//
// Inbox against a real Postgres database. Skipped when DATABASE_URL is unset.
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { socialFriendRequest, socialHandle, socialNotification } from "~/db/schema";
import { sharesActiveBuddyRead } from "./buddy-read-eligibility";
import {
	blockUser,
	cancelRequest,
	removeFriend,
	respondToRequest,
	sendFriendRequest,
	unblockUser,
} from "./friends";
import { claimHandle } from "./handle";
import { createNotification, listInbox, markAllRead, markRead, unreadCount } from "./inbox";
import { createInvite, redeemInvite } from "./invite";

vi.mock("./buddy-read-eligibility", () => ({ sharesActiveBuddyRead: vi.fn(async () => true) }));
const eligibility = vi.mocked(sharesActiveBuddyRead);

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY_MS = 86_400_000;

async function requestBetween(a: string, b: string) {
	const [row] = await db
		.select()
		.from(socialFriendRequest)
		.where(and(eq(socialFriendRequest.requesterId, a), eq(socialFriendRequest.addresseeId, b)));
	if (!row) throw new Error("expected a request row");
	return row;
}

async function rowsFor(recipient: string) {
	return db.select().from(socialNotification).where(eq(socialNotification.recipientId, recipient));
}

describe.skipIf(!hasDb)("inbox (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const alice = `test-inbox-a-${run}`;
	const bob = `test-inbox-b-${run}`;
	const carol = `test-inbox-c-${run}`;
	const all = [alice, bob, carol];

	beforeAll(async () => {
		await db
			.insert(user)
			.values(all.map((id) => ({ id, name: `Name ${id}`, email: `${id}@example.test` })));
		await claimHandle(alice, `alice_${run}`, "Alice");
		await claimHandle(bob, `bob_${run}`, "Bob");
		await claimHandle(carol, `carol_${run}`, "Carol");
	});

	afterAll(async () => {
		await db.delete(user).where(inArray(user.id, all));
		const rows = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = rows.map((r) => r.handle).filter((h) => h.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	test("a request creates one unread item for the addressee, and a rejected request creates none", async () => {
		eligibility.mockResolvedValueOnce(false);
		await expect(sendFriendRequest(alice, carol)).rejects.toMatchObject({ code: "not_found" });
		expect(await rowsFor(carol)).toHaveLength(0);

		await sendFriendRequest(alice, bob);
		const page = await listInbox(bob, null);
		expect(page.items).toHaveLength(1);
		expect(page.items[0]).toMatchObject({
			type: "friend_request_received",
			readAt: null,
			actor: { userId: alice, handle: `alice_${run}`, name: "Alice", avatarUrl: null },
			subject: { kind: "friend_request", state: "pending" },
		});
		expect(page.items[0]).not.toHaveProperty("email");
		expect(await unreadCount(bob)).toBe(1);
		expect(await unreadCount(alice)).toBe(0);
	});

	test("a repeated request collapses into the same item; cancel removes it", async () => {
		const [before] = await rowsFor(bob);
		const request = await requestBetween(alice, bob);
		await cancelRequest(alice, request.id);
		expect(await rowsFor(bob)).toHaveLength(0);

		await sendFriendRequest(alice, bob);
		await sendFriendRequest(alice, bob);
		const rows = await rowsFor(bob);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).not.toBe(before?.id);
	});

	test("declining is silent for the sender; the recipient keeps a read, declined item", async () => {
		const request = await requestBetween(alice, bob);
		await respondToRequest(bob, request.id, "decline");
		expect(await rowsFor(alice)).toHaveLength(0);
		expect(await unreadCount(bob)).toBe(0);
		const [item] = (await listInbox(bob, null)).items;
		expect(item).toMatchObject({
			type: "friend_request_received",
			subject: { kind: "friend_request", requestId: request.id, state: "declined" },
		});
		expect(item?.readAt).not.toBeNull();
		// A re-request inside the cooldown must not wake the recipient.
		await sendFriendRequest(alice, bob);
		expect(await unreadCount(bob)).toBe(0);
		expect((await listInbox(bob, null)).items[0]?.subject).toMatchObject({ state: "declined" });
	});

	test("accepting tells the sender; the recipient's item turns into a read, accepted one", async () => {
		const later = new Date(Date.now() + 91 * DAY_MS);
		await sendFriendRequest(alice, bob, later);
		const request = await requestBetween(alice, bob);
		expect((await listInbox(bob, null, later)).items[0]?.subject).toMatchObject({
			state: "pending",
		});
		await respondToRequest(bob, request.id, "accept", later);
		// The item was created and read at wall-clock time, so it is listed at wall-clock time too.
		expect(await unreadCount(bob)).toBe(0);
		const mine = await listInbox(bob, null);
		expect(mine.items).toHaveLength(1);
		expect(mine.items[0]?.subject).toMatchObject({ state: "accepted" });
		expect(mine.items[0]?.readAt).not.toBeNull();
		const page = await listInbox(alice, null, later);
		expect(page.items).toHaveLength(1);
		expect(page.items[0]).toMatchObject({
			type: "friend_request_accepted",
			actor: { userId: bob },
			subject: null,
		});
		expect(await unreadCount(alice, later)).toBe(1);
	});

	test("removing a friend creates nothing and retires the accepted request item", async () => {
		const later = new Date(Date.now() + 91 * DAY_MS);
		await removeFriend(alice, bob);
		expect((await listInbox(bob, null, later)).items).toHaveLength(0);
		expect(await rowsFor(bob)).toHaveLength(0);
	});

	test("mutual requests: the first sender is told, the second's received item is the record", async () => {
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		await sendFriendRequest(alice, carol);
		await sendFriendRequest(carol, alice);
		const a = await rowsFor(alice);
		expect(a.map((r) => r.type)).toEqual(["friend_request_accepted"]);
		const c = (await listInbox(carol, null)).items;
		expect(
			c.map((i) => [i.type, i.subject && "state" in i.subject ? i.subject.state : undefined]),
		).toEqual([["friend_request_received", "accepted"]]);
		expect(c[0]?.readAt).not.toBeNull();
		expect(await unreadCount(carol)).toBe(0);
		await removeFriend(alice, carol);
	});

	test("an invite redemption notifies the link owner only", async () => {
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		const { url } = await createInvite(bob);
		const token = url.slice(url.lastIndexOf("/") + 1);
		expect((await redeemInvite(carol, token)).state).toBe("already_friends");
		const owner = await listInbox(bob, null);
		expect(owner.items).toHaveLength(1);
		expect(owner.items[0]).toMatchObject({
			type: "friend_joined_via_invite",
			actor: { userId: carol, handle: `carol_${run}` },
		});
		expect(await rowsFor(carol)).toHaveLength(0);
		await removeFriend(bob, carol);
	});

	test("mark read is scoped to the recipient; mark all clears the count", async () => {
		const [item] = await rowsFor(bob);
		if (!item) throw new Error("expected an item");
		expect(await unreadCount(bob)).toBe(1);
		await markRead(alice, item.id);
		expect(await unreadCount(bob)).toBe(1);
		await markRead(bob, randomUUID());
		expect(await unreadCount(bob)).toBe(1);
		await markRead(bob, item.id);
		expect(await unreadCount(bob)).toBe(0);
		expect((await listInbox(bob, null)).items[0]?.readAt).not.toBeNull();

		await db.transaction((tx) =>
			createNotification(tx, {
				recipientId: bob,
				actorId: alice,
				type: "friend_joined_via_invite",
				subjectId: alice,
			}),
		);
		expect(await unreadCount(bob)).toBe(1);
		await markAllRead(bob);
		expect(await unreadCount(bob)).toBe(0);
	});

	test("mark all leaves items that still wait for an answer unread", async () => {
		await db.delete(socialNotification).where(eq(socialNotification.recipientId, bob));
		await sendFriendRequest(alice, bob);
		await db.transaction((tx) =>
			createNotification(tx, {
				recipientId: bob,
				actorId: alice,
				type: "friend_joined_via_invite",
				subjectId: alice,
			}),
		);
		expect(await unreadCount(bob)).toBe(2);
		await markAllRead(bob);
		expect(await unreadCount(bob)).toBe(1);
		const [pending] = (await listInbox(bob, null)).items.filter((i) => i.readAt === null);
		expect(pending?.type).toBe("friend_request_received");

		const [request] = await db
			.select({ id: socialFriendRequest.id })
			.from(socialFriendRequest)
			.where(
				and(
					eq(socialFriendRequest.requesterId, alice),
					eq(socialFriendRequest.addresseeId, bob),
					eq(socialFriendRequest.state, "pending"),
				),
			);
		await cancelRequest(alice, request?.id ?? "");
		expect(await unreadCount(bob)).toBe(0);
	});

	test("blocking deletes items both ways, hides items at read time, and unblocking restores nothing", async () => {
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		await sendFriendRequest(alice, bob);
		await db.transaction((tx) =>
			createNotification(tx, {
				recipientId: alice,
				actorId: bob,
				type: "friend_joined_via_invite",
				subjectId: bob,
			}),
		);
		expect(await rowsFor(bob)).toHaveLength(1);
		expect(await rowsFor(alice)).toHaveLength(1);
		await blockUser(bob, alice);
		expect(await rowsFor(bob)).toHaveLength(0);
		expect(await rowsFor(alice)).toHaveLength(0);

		// Safety net: a row that somehow exists across a block is neither listed nor counted.
		await db.transaction((tx) =>
			createNotification(tx, {
				recipientId: alice,
				actorId: bob,
				type: "friend_joined_via_invite",
				subjectId: bob,
			}),
		);
		expect((await listInbox(alice, null)).items).toHaveLength(0);
		expect(await unreadCount(alice)).toBe(0);
		await unblockUser(bob, alice);
		expect((await listInbox(alice, null)).items).toHaveLength(1);
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
	});

	test("a banned actor's items disappear from list and count", async () => {
		await db.transaction((tx) =>
			createNotification(tx, {
				recipientId: alice,
				actorId: carol,
				type: "friend_joined_via_invite",
				subjectId: carol,
			}),
		);
		expect(await unreadCount(alice)).toBe(1);
		await db.update(user).set({ banned: true }).where(eq(user.id, carol));
		expect((await listInbox(alice, null)).items).toHaveLength(0);
		expect(await unreadCount(alice)).toBe(0);
		await db.update(user).set({ banned: false }).where(eq(user.id, carol));
		expect(await unreadCount(alice)).toBe(1);
	});

	test("lists newest first with a working cursor", async () => {
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		const base = Date.now();
		for (let i = 0; i < 5; i++) {
			await db.insert(socialNotification).values({
				recipientId: alice,
				actorId: bob,
				type: "friend_request_accepted",
				subjectId: `s${i}`,
				createdAt: new Date(base + i * 1000),
			});
		}
		const first = await listInbox(alice, null, new Date(base + 10_000), 2);
		expect(first.items.map((i) => i.createdAt)).toEqual([base + 4000, base + 3000]);
		expect(first.nextCursor).not.toBeNull();
		const second = await listInbox(alice, first.nextCursor, new Date(base + 10_000), 2);
		expect(second.items.map((i) => i.createdAt)).toEqual([base + 2000, base + 1000]);
		const third = await listInbox(alice, second.nextCursor, new Date(base + 10_000), 2);
		expect(third.items.map((i) => i.createdAt)).toEqual([base]);
		expect(third.nextCursor).toBeNull();
	});

	test("expired items are neither shown nor counted and are deleted on the next visit", async () => {
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		const now = new Date();
		await db.insert(socialNotification).values([
			{
				recipientId: alice,
				actorId: bob,
				type: "friend_request_accepted",
				subjectId: "old-read",
				createdAt: new Date(now.getTime() - 100 * DAY_MS),
				readAt: new Date(now.getTime() - 91 * DAY_MS),
			},
			{
				recipientId: alice,
				actorId: bob,
				type: "friend_request_accepted",
				subjectId: "ancient",
				createdAt: new Date(now.getTime() - 366 * DAY_MS),
			},
			{
				recipientId: alice,
				actorId: bob,
				type: "friend_request_accepted",
				subjectId: "fresh",
				createdAt: new Date(now.getTime() - 10 * DAY_MS),
			},
		]);
		expect(await unreadCount(alice, now)).toBe(1);
		const page = await listInbox(alice, null, now);
		expect(page.items.map((i) => i.type)).toEqual(["friend_request_accepted"]);
		expect(await rowsFor(alice)).toHaveLength(1);
	});

	test("an expired pending request is dropped from the inbox, by the count as well", async () => {
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		await sendFriendRequest(alice, bob);
		const later = new Date(Date.now() + 31 * DAY_MS);
		expect(await unreadCount(bob, later)).toBe(0);
		expect(await rowsFor(bob)).toHaveLength(0);
		expect((await listInbox(bob, null, later)).items).toHaveLength(0);
	});
});
