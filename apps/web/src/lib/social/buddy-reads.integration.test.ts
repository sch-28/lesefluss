// @vitest-environment node
//
// Buddy reads against a real Postgres database. Skipped when DATABASE_URL is unset.
// The tests build on each other's state in file order; run the file, not single tests.
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import {
	buddyRead,
	buddyReadInvite,
	buddyReadMember,
	socialHandle,
	socialNotification,
	socialRestriction,
	socialTakedown,
	syncBookCopy,
	syncBooks,
} from "~/db/schema";
import { deleteUserAccount, purgeUserSyncData } from "~/lib/account-deletion";
import { suspendSharing } from "~/lib/moderation/restrictions";
import { takeDownBooks } from "~/lib/moderation/takedown";
import { sharesActiveBuddyRead } from "./buddy-read-eligibility";
import {
	cancelBuddyReadInvite,
	createBuddyRead,
	getBuddyRead,
	getBuddyReadProgress,
	inviteToBuddyRead,
	leaveBuddyRead,
	listBuddyReads,
	removeBuddyReadMember,
	respondToBuddyReadInvite,
	setBuddyReadTargetDate,
	settleBuddyReads,
} from "./buddy-reads";
import {
	blockUser,
	createFriendship,
	removeFriend,
	respondToRequest,
	sendFriendRequest,
} from "./friends";
import { claimHandle } from "./handle";
import { listInbox } from "./inbox";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY_MS = 86_400_000;

describe.skipIf(!hasDb)("buddy reads (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const names = [
		"alice",
		"bob",
		"carol",
		"dave",
		"erin",
		"frank",
		"gina",
		"hank",
		"ivan",
		"judy",
		"kim",
		"leo",
		"sam",
	] as const;
	const id = Object.fromEntries(names.map((n) => [n, `test-br-${n}-${run}`])) as Record<
		(typeof names)[number],
		string
	>;
	const all = Object.values(id);
	const { alice, bob, carol, dave, erin, frank, gina, hank, ivan, judy, kim, leo, sam } = id;
	const now = new Date();
	let r1 = "";
	let r2 = "";
	let r3 = "";

	function bookRow(userId: string, bookId: string, extra: Partial<typeof syncBooks.$inferInsert>) {
		return {
			userId,
			bookId,
			originUserId: userId,
			originBookId: bookId,
			title: "Moby-Dick",
			author: "Melville",
			content: "Call me Ishmael.",
			wordCount: 100,
			wordPosition: 0,
			updatedAt: new Date(now.getTime() - DAY_MS),
			...extra,
		};
	}
	async function booksOf(userId: string) {
		return db.select().from(syncBooks).where(eq(syncBooks.userId, userId));
	}
	async function setPosition(userId: string, bookId: string, wordPosition: number) {
		await db
			.update(syncBooks)
			.set({ wordPosition })
			.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookId)));
		await settleBuddyReads(userId, [bookId]);
	}
	async function member(readId: string, userId: string) {
		const [row] = await db
			.select()
			.from(buddyReadMember)
			.where(and(eq(buddyReadMember.buddyReadId, readId), eq(buddyReadMember.userId, userId)));
		return row;
	}
	async function inviteFor(readId: string, inviteeId: string) {
		const [row] = await db
			.select()
			.from(buddyReadInvite)
			.where(
				and(
					eq(buddyReadInvite.buddyReadId, readId),
					eq(buddyReadInvite.inviteeId, inviteeId),
					eq(buddyReadInvite.status, "pending"),
				),
			);
		return row;
	}
	async function inboxOf(userId: string) {
		return (await listInbox(userId, null)).items;
	}
	async function participantIds(viewer: string, readId: string) {
		return (await getBuddyRead(viewer, readId)).participants.map((p) => p.identity.userId);
	}
	async function joinByInvite(readId: string, userId: string) {
		const invite = await inviteFor(readId, userId);
		if (!invite) throw new Error(`no pending invite for ${userId}`);
		return respondToBuddyReadInvite(userId, invite.id, "accept");
	}

	beforeAll(async () => {
		process.env.BETTER_AUTH_SECRET ??= "test-secret";
		process.env.BETTER_AUTH_URL ??= "https://lesefluss.test";
		await db
			.insert(user)
			.values(all.map((u) => ({ id: u, name: `Name ${u}`, email: `${u}@example.test` })));
		for (const n of names) await claimHandle(id[n], `${n}_${run}`, n);
		for (const n of names) {
			if (n !== "alice" && n !== "sam") {
				await db.transaction((tx) => createFriendship(tx, alice, id[n], now));
			}
		}
		await db.insert(syncBooks).values([
			bookRow(alice, "aaaa1111", { wordPosition: 10 }),
			bookRow(alice, "aaaa2222", { content: null }),
			bookRow(alice, "aaaa3333", { seriesId: "ssss0001" }),
			bookRow(alice, "aaaa4444", { deleted: true }),
			bookRow(alice, "aaaa5555", { title: "Second" }),
			bookRow(alice, "aaaa6666", { title: "Taken" }),
			bookRow(alice, "aaaa7777", { title: "Crowded" }),
			// Dave already holds a copy of alice's book, finished before any buddy read.
			bookRow(dave, "dddd1111", {
				originUserId: alice,
				originBookId: "aaaa1111",
				wordPosition: 100,
			}),
			// Erin imported the same text herself: a different origin.
			bookRow(erin, "eeee1111", {}),
		]);
	});

	afterAll(async () => {
		await db.delete(buddyRead).where(inArray(buddyRead.originUserId, all));
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		await db.delete(socialRestriction).where(inArray(socialRestriction.userId, all));
		await db.delete(socialTakedown).where(inArray(socialTakedown.userId, all));
		await db.delete(syncBookCopy).where(inArray(syncBookCopy.userId, all));
		await db.delete(syncBooks).where(inArray(syncBooks.userId, all));
		await db.delete(user).where(inArray(user.id, all));
		const rows = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = rows.map((r) => r.handle).filter((h) => h.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	test("starting is refused for books that cannot be shared, strangers and a suspended host", async () => {
		const start = (bookId: string, inviteeIds: string[] = []) =>
			createBuddyRead(alice, { bookId, inviteeIds });
		for (const bookId of ["ffffffff", "aaaa2222", "aaaa3333", "aaaa4444"]) {
			await expect(start(bookId)).rejects.toMatchObject({ code: "not_shareable" });
		}
		await expect(start("aaaa1111", [sam])).rejects.toMatchObject({ code: "not_found" });

		await db.transaction((tx) =>
			suspendSharing(tx, {
				userId: alice,
				until: new Date(now.getTime() + DAY_MS),
				reason: "test",
				noticeId: null,
				createdBy: alice,
			}),
		);
		await expect(start("aaaa1111")).rejects.toMatchObject({ code: "suspended" });
		await db.delete(socialRestriction).where(eq(socialRestriction.userId, alice));

		await db.insert(socialTakedown).values({
			scope: "origin",
			userId: alice,
			bookId: "aaaa6666",
			originUserId: alice,
			originBookId: "aaaa6666",
		});
		await expect(start("aaaa6666")).rejects.toMatchObject({ code: "not_shareable" });
		expect(await db.select().from(buddyRead).where(eq(buddyRead.originUserId, alice))).toHaveLength(
			0,
		);
	});

	test("the host invites friends up to eight people, pending invites included", async () => {
		({ buddyReadId: r1 } = await createBuddyRead(alice, {
			bookId: "aaaa1111",
			inviteeIds: [bob, carol, dave, erin],
		}));
		await expect(
			createBuddyRead(alice, { bookId: "aaaa1111", inviteeIds: [] }),
		).rejects.toMatchObject({ code: "already_member" });
		await expect(inviteToBuddyRead(alice, r1, [frank, gina, hank, ivan])).rejects.toMatchObject({
			code: "full",
		});
		await inviteToBuddyRead(alice, r1, [frank, gina, hank]);
		await expect(inviteToBuddyRead(alice, r1, [ivan])).rejects.toMatchObject({ code: "full" });
		await expect(inviteToBuddyRead(bob, r1, [ivan])).rejects.toMatchObject({ code: "not_found" });

		const [item] = (await inboxOf(bob)).filter((i) => i.type === "buddy_read_invite");
		expect(item?.subject).toMatchObject({
			kind: "buddy_read_invite",
			buddyReadId: r1,
			state: "pending",
			book: { title: "Moby-Dick", author: "Melville" },
			host: { userId: alice },
		});
		expect(
			item?.subject?.kind === "buddy_read_invite" && item.subject.participants.map((p) => p.userId),
		).toEqual([alice]);
	});

	test("a decline tells nobody and the host can cancel a pending invite", async () => {
		const carolsInvite = await inviteFor(r1, carol);
		await respondToBuddyReadInvite(carol, carolsInvite?.id ?? "", "decline");
		const [item] = (await inboxOf(carol)).filter((i) => i.type === "buddy_read_invite");
		expect(item?.subject).toMatchObject({ state: "declined" });
		expect(item?.readAt).not.toBeNull();
		expect(await inboxOf(alice)).toHaveLength(0);

		const hanksInvite = await inviteFor(r1, hank);
		await cancelBuddyReadInvite(alice, hanksInvite?.id ?? "");
		expect((await inboxOf(hank)).filter((i) => i.type === "buddy_read_invite")).toHaveLength(0);
		await expect(cancelBuddyReadInvite(alice, hanksInvite?.id ?? "")).rejects.toMatchObject({
			code: "not_found",
		});
	});

	test("an invitee without the book receives a copy of the host's book on join", async () => {
		const { bookId } = await joinByInvite(r1, bob);
		expect(bookId).not.toBe("aaaa1111");
		const [copy] = await booksOf(bob);
		expect(copy).toMatchObject({
			bookId,
			originUserId: alice,
			originBookId: "aaaa1111",
			wordPosition: 0,
			content: "Call me Ishmael.",
		});
		const [record] = await db.select().from(syncBookCopy).where(eq(syncBookCopy.userId, bob));
		expect(record?.via).toBe("buddy_read");
		const joined = (await inboxOf(alice)).find((i) => i.type === "buddy_read_joined");
		expect(joined?.actor?.userId).toBe(bob);
		const [invite] = (await inboxOf(bob)).filter((i) => i.type === "buddy_read_invite");
		expect(invite?.subject).toMatchObject({ state: "accepted" });
	});

	test("an invitee holding a copy of the same origin joins with it; another origin is never linked", async () => {
		expect((await joinByInvite(r1, dave)).bookId).toBe("dddd1111");
		expect(await booksOf(dave)).toHaveLength(1);

		const { bookId } = await joinByInvite(r1, erin);
		expect(bookId).not.toBe("eeee1111");
		const erins = await booksOf(erin);
		expect(erins).toHaveLength(2);
		expect(erins.find((b) => b.bookId === bookId)).toMatchObject({
			originUserId: alice,
			originBookId: "aaaa1111",
		});
	});

	test("members see each other's progress; the host sees pending invites", async () => {
		const erinsCopy = (await booksOf(erin)).find((b) => b.originUserId === alice);
		await db
			.update(syncBooks)
			.set({ updatedAt: new Date(now.getTime() + 5 * DAY_MS) })
			.where(and(eq(syncBooks.userId, erin), eq(syncBooks.bookId, erinsCopy?.bookId ?? "")));

		const detail = await getBuddyRead(bob, r1);
		expect(detail.isHost).toBe(false);
		expect(detail.approximate).toBe(false);
		expect(detail.invites).toEqual([]);
		const byId = new Map(detail.participants.map((p) => [p.identity.userId, p]));
		expect([...byId.keys()].sort()).toEqual([alice, bob, dave, erin].sort());
		expect(byId.get(alice)).toMatchObject({ isHost: true, percent: 10, relationship: "friends" });
		expect(byId.get(bob)).toMatchObject({ isSelf: true, percent: 0 });
		expect(byId.get(dave)).toMatchObject({ percent: 100, isFriend: false, relationship: "none" });
		expect(byId.get(erin)?.lastActiveAt).toBeLessThanOrEqual(Date.now());

		const hostView = await getBuddyRead(alice, r1);
		expect(hostView.isHost).toBe(true);
		expect(hostView.invites.map((i) => i.invitee.userId).sort()).toEqual([frank, gina].sort());

		const progress = await getBuddyReadProgress(bob, r1);
		expect(progress.participants.map((p) => p.userId).sort()).toEqual([alice, dave, erin].sort());
		expect(progress.participants.find((p) => p.userId === alice)).toMatchObject({
			wordPosition: 10,
			wordCount: 100,
			percent: 10,
		});

		await db
			.update(syncBooks)
			.set({ wordCount: 101 })
			.where(and(eq(syncBooks.userId, erin), eq(syncBooks.bookId, erinsCopy?.bookId ?? "")));
		expect((await getBuddyRead(bob, r1)).approximate).toBe(true);
		expect((await getBuddyReadProgress(bob, r1)).approximate).toBe(true);
		await db
			.update(syncBooks)
			.set({ wordCount: 100 })
			.where(and(eq(syncBooks.userId, erin), eq(syncBooks.bookId, erinsCopy?.bookId ?? "")));
	});

	test("non-members, including invitees who declined, get not found", async () => {
		for (const outsider of [sam, carol, frank]) {
			await expect(getBuddyRead(outsider, r1)).rejects.toMatchObject({ code: "not_found" });
			await expect(getBuddyReadProgress(outsider, r1)).rejects.toMatchObject({
				code: "not_found",
			});
		}
		expect(await listBuddyReads(sam)).toEqual([]);
		const [summary] = await listBuddyReads(bob);
		expect(summary).toMatchObject({ id: r1, memberCount: 4, host: { userId: alice } });
	});

	test("the host sets and clears a target date", async () => {
		const target = now.getTime() + 10 * DAY_MS;
		await setBuddyReadTargetDate(alice, r1, target);
		expect((await getBuddyRead(bob, r1)).targetDate).toBe(target);
		await expect(setBuddyReadTargetDate(bob, r1, null)).rejects.toMatchObject({ code: "not_host" });
		await setBuddyReadTargetDate(alice, r1, null);
		expect((await getBuddyRead(bob, r1)).targetDate).toBeNull();
	});

	test("a book finished before joining does not count; a finish after joining sticks and notifies", async () => {
		await settleBuddyReads(dave, ["dddd1111"]);
		expect((await member(r1, dave))?.finishedAt).toBeNull();
		await setPosition(dave, "dddd1111", 50);
		expect((await member(r1, dave))?.finishArmed).toBe(true);
		await setPosition(dave, "dddd1111", 97);
		const finishedAt = (await member(r1, dave))?.finishedAt;
		expect(finishedAt).not.toBeNull();
		for (const other of [alice, bob, erin]) {
			const item = (await inboxOf(other)).find((i) => i.type === "buddy_read_finished");
			expect(item?.actor?.userId).toBe(dave);
		}
		await setPosition(dave, "dddd1111", 20);
		expect((await member(r1, dave))?.finishedAt).toEqual(finishedAt);
		expect((await getBuddyRead(alice, r1)).status).toBe("in_progress");
	});

	test("co-members who are not friends can befriend, block, and lose the right once one leaves", async () => {
		expect(await sharesActiveBuddyRead(db, bob, dave)).toBe(true);
		expect(await sendFriendRequest(bob, dave)).toBe("pending_outgoing");
		const request = (await inboxOf(dave)).find((i) => i.type === "friend_request_received");
		const requestId = request?.subject?.kind === "friend_request" ? request.subject.requestId : "";
		expect(await respondToRequest(dave, requestId, "accept")).toBe("friends");
		expect(
			(await getBuddyRead(bob, r1)).participants.find((p) => p.identity.userId === dave),
		).toMatchObject({ isFriend: true, relationship: "friends" });

		// A block lands while both are members, and each disappears for the other.
		await blockUser(dave, erin);
		expect(await participantIds(dave, r1)).not.toContain(erin);
		expect(await participantIds(erin, r1)).not.toContain(dave);
		expect((await getBuddyReadProgress(erin, r1)).participants.map((p) => p.userId)).not.toContain(
			dave,
		);
		expect((await inboxOf(erin)).some((i) => i.actor?.userId === dave)).toBe(false);

		expect(await sharesActiveBuddyRead(db, bob, erin)).toBe(true);
		await leaveBuddyRead(erin, r1);
		expect(await sharesActiveBuddyRead(db, bob, erin)).toBe(false);
		await expect(sendFriendRequest(bob, erin)).rejects.toMatchObject({ code: "not_found" });
		await expect(getBuddyRead(erin, r1)).rejects.toMatchObject({ code: "not_found" });
		expect((await booksOf(erin)).filter((b) => !b.deleted)).toHaveLength(2);
		// Invitees never count.
		expect(await sharesActiveBuddyRead(db, alice, gina)).toBe(false);
	});

	test("banned members are hidden from everyone", async () => {
		await db.update(user).set({ banned: true }).where(eq(user.id, dave));
		expect(await participantIds(bob, r1)).not.toContain(dave);
		expect(await sharesActiveBuddyRead(db, bob, dave)).toBe(false);
		await db.update(user).set({ banned: false }).where(eq(user.id, dave));
		expect(await participantIds(bob, r1)).toContain(dave);
	});

	test("the host removes a member, who can come back only through a new invite", async () => {
		const { bookId } = await joinByInvite(r1, frank);
		await setPosition(frank, bookId ?? "", 97);
		expect((await member(r1, frank))?.finishedAt).not.toBeNull();
		await expect(removeBuddyReadMember(bob, r1, frank)).rejects.toMatchObject({ code: "not_host" });
		await removeBuddyReadMember(alice, r1, frank);
		expect((await member(r1, frank))?.state).toBe("removed");
		await expect(getBuddyRead(frank, r1)).rejects.toMatchObject({ code: "not_found" });
		expect(await inviteFor(r1, frank)).toBeUndefined();
		await inviteToBuddyRead(alice, r1, [frank]);
		await joinByInvite(r1, frank);
		// A rejoin starts over: the earlier finish is gone, and a book already past
		// the threshold must dip below it before it can count again.
		expect(await member(r1, frank)).toMatchObject({
			state: "active",
			finishedAt: null,
			finishArmed: false,
		});
	});

	test("the host cannot act on a member hidden by a block", async () => {
		await db.transaction((tx) => createFriendship(tx, alice, sam, now));
		await inviteToBuddyRead(alice, r1, [sam]);
		await joinByInvite(r1, sam);
		await blockUser(sam, alice);
		expect(await participantIds(alice, r1)).not.toContain(sam);
		await expect(removeBuddyReadMember(alice, r1, sam)).rejects.toMatchObject({
			code: "not_found",
		});
		expect((await member(r1, sam))?.state).toBe("active");
	});

	test("invites go void on expiry and unfriending, and close on a block", async () => {
		const ginas = await inviteFor(r1, gina);
		await db
			.update(buddyReadInvite)
			.set({ createdAt: new Date(now.getTime() - 31 * DAY_MS) })
			.where(eq(buddyReadInvite.id, ginas?.id ?? ""));
		const [expired] = (await inboxOf(gina)).filter((i) => i.type === "buddy_read_invite");
		expect(expired?.subject).toMatchObject({ state: "unavailable" });
		await expect(respondToBuddyReadInvite(gina, ginas?.id ?? "", "accept")).rejects.toMatchObject({
			code: "unavailable",
		});
		await db
			.update(buddyReadInvite)
			.set({ createdAt: now })
			.where(eq(buddyReadInvite.id, ginas?.id ?? ""));

		await removeFriend(alice, gina);
		expect(await inviteFor(r1, gina)).toBeUndefined();
		expect((await inboxOf(gina)).filter((i) => i.type === "buddy_read_invite")).toHaveLength(0);

		await inviteToBuddyRead(alice, r1, [ivan]);
		await blockUser(ivan, alice);
		expect(await inviteFor(r1, ivan)).toBeUndefined();
	});

	test("the host passes on when the host leaves, and an invite from a former member goes void", async () => {
		({ buddyReadId: r2 } = await createBuddyRead(alice, {
			bookId: "aaaa5555",
			inviteeIds: [judy, kim],
		}));
		await joinByInvite(r2, judy);
		await leaveBuddyRead(alice, r2);
		expect((await getBuddyRead(judy, r2)).isHost).toBe(true);
		expect((await listBuddyReads(judy))[0]?.host?.userId).toBe(judy);
		const [item] = (await inboxOf(kim)).filter((i) => i.type === "buddy_read_invite");
		expect(item?.subject).toMatchObject({ state: "unavailable" });
		// The new host's own accepted invite still names a host: themselves.
		const [judysInvite] = (await inboxOf(judy)).filter((i) => i.type === "buddy_read_invite");
		expect(judysInvite?.subject).toMatchObject({ state: "accepted", host: { userId: judy } });
		expect(await booksOf(alice)).toHaveLength(7);
	});

	test("a read finishes when every member has, then accepts nothing new", async () => {
		const judys = (await booksOf(judy))[0]?.bookId ?? "";
		await setPosition(judy, judys, 100);
		const [summary] = await listBuddyReads(judy);
		expect(summary).toMatchObject({ id: r2, status: "finished" });
		expect(summary?.finishedAt).not.toBeNull();
		await expect(inviteToBuddyRead(judy, r2, [alice])).rejects.toMatchObject({
			code: "unavailable",
		});
		await expect(setBuddyReadTargetDate(judy, r2, null)).rejects.toMatchObject({
			code: "unavailable",
		});
	});

	test("concurrent invites and joins never exceed the cap, and concurrent leaves keep one host", async () => {
		({ buddyReadId: r3 } = await createBuddyRead(alice, { bookId: "aaaa7777", inviteeIds: [] }));
		const batches = [
			[bob, carol, dave],
			[erin, frank, hank],
			[judy, kim, leo],
		];
		const results = await Promise.allSettled(
			batches.map((batch) => inviteToBuddyRead(alice, r3, batch)),
		);
		expect(results.some((r) => r.status === "rejected")).toBe(true);
		const pending = await db
			.select()
			.from(buddyReadInvite)
			.where(and(eq(buddyReadInvite.buddyReadId, r3), eq(buddyReadInvite.status, "pending")));
		expect(pending.length).toBeLessThanOrEqual(7);

		await Promise.all(pending.map((i) => respondToBuddyReadInvite(i.inviteeId, i.id, "accept")));
		const members = await db
			.select()
			.from(buddyReadMember)
			.where(and(eq(buddyReadMember.buddyReadId, r3), eq(buddyReadMember.state, "active")));
		expect(members.length).toBe(pending.length + 1);
		expect(members.length).toBeLessThanOrEqual(8);

		const other = pending[0]?.inviteeId ?? "";
		await Promise.all([leaveBuddyRead(alice, r3), leaveBuddyRead(other, r3)]);
		const remaining = pending.map((i) => i.inviteeId).filter((u) => u !== other);
		const detail = await getBuddyRead(remaining[0] ?? "", r3);
		expect(detail.participants.filter((p) => p.isHost)).toHaveLength(1);
		const [row] = await db.select().from(buddyRead).where(eq(buddyRead.id, r3));
		expect(remaining).toContain(row?.hostId);
	});

	test("a member whose linked book is gone counts as having left", async () => {
		const bobs = (await booksOf(bob)).find((b) => b.originBookId === "aaaa1111");
		await db
			.update(syncBooks)
			.set({ deleted: true })
			.where(and(eq(syncBooks.userId, bob), eq(syncBooks.bookId, bobs?.bookId ?? "")));
		await expect(getBuddyRead(bob, r1)).rejects.toMatchObject({ code: "not_found" });
		expect(await participantIds(alice, r1)).not.toContain(bob);
		expect((await member(r1, bob))?.state).toBe("left");
		expect(await sharesActiveBuddyRead(db, alice, bob)).toBe(false);
	});

	test("after a takedown of the origin members see only that the book is gone", async () => {
		const copies = await db
			.select({ userId: syncBooks.userId, bookId: syncBooks.bookId })
			.from(syncBooks)
			.where(and(eq(syncBooks.originUserId, alice), eq(syncBooks.originBookId, "aaaa1111")));
		await db.transaction((tx) =>
			takeDownBooks(
				tx,
				copies.map((c) => ({ ...c, originUserId: alice, originBookId: "aaaa1111" })),
				null,
				"origin",
			),
		);
		const detail = await getBuddyRead(dave, r1);
		expect(detail).toMatchObject({ originUnavailable: true, participants: [] });
		expect((await getBuddyReadProgress(dave, r1)).participants).toEqual([]);
		await expect(inviteToBuddyRead(alice, r1, [leo])).rejects.toMatchObject({
			code: "unavailable",
		});
	});

	test("account deletion removes memberships and invites, hands over host and deletes empty reads", async () => {
		const [before] = await db.select().from(buddyRead).where(eq(buddyRead.id, r3));
		const host = before?.hostId ?? "";
		const others = (
			await db
				.select()
				.from(buddyReadMember)
				.where(and(eq(buddyReadMember.buddyReadId, r3), eq(buddyReadMember.state, "active")))
		)
			.map((m) => m.userId)
			.filter((u) => u !== host);
		expect(others.length).toBeGreaterThan(1);
		await db.transaction((tx) => createFriendship(tx, host, sam, now));
		await inviteToBuddyRead(host, r3, [sam]);

		// The purge inside the caller's transaction, as deleteUserAccount runs it.
		await db.transaction(async (tx) => {
			await purgeUserSyncData(tx, host);
			await tx.delete(user).where(eq(user.id, host));
		});
		const [after] = await db.select().from(buddyRead).where(eq(buddyRead.id, r3));
		expect(after).toBeDefined();
		expect(others).toContain(
			(await getBuddyRead(others[0] ?? "", r3)).participants.find((p) => p.isHost)?.identity.userId,
		);
		const invites = await db
			.select()
			.from(buddyReadInvite)
			.where(eq(buddyReadInvite.inviterId, host));
		expect(invites).toHaveLength(0);

		// The account page and the admin action both run deleteUserAccount.
		for (const u of others) await deleteUserAccount(u);
		expect(await db.select().from(buddyRead).where(eq(buddyRead.id, r3))).toHaveLength(0);
	});
});
