// @vitest-environment node
//
// Push outbox and sender against a real Postgres database, with a fake FCM.
// Skipped when DATABASE_URL is unset.
import { randomUUID } from "node:crypto";
import {
	DEFAULT_PUSH_PREFERENCES,
	DISPLAY_NAME_MAX_LENGTH,
	type NotificationType,
	PUSH_PREVIEW_MAX_CHARS,
} from "@lesefluss/core";
import { and, eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { session, user } from "~/db/auth-schema";
import {
	buddyRead,
	socialFriendship,
	socialHandle,
	socialNotification,
	socialPushOutbox,
	socialPushPreferences,
	socialPushSent,
	socialPushToken,
	syncBookCopy,
	syncBooks,
} from "~/db/schema";
import { addReaction, postComment, replyToComment } from "~/lib/social/buddy-read-discussion";
import { createBuddyRead, respondToBuddyReadInvite } from "~/lib/social/buddy-reads";
import { blockUser, createFriendship } from "~/lib/social/friends";
import { claimHandle } from "~/lib/social/handle";
import { createNotification, listInbox, markRead } from "~/lib/social/inbox";
import { orderedPair } from "~/lib/social/relationship";
import {
	drainPushOutbox,
	PUSH_MAX_AGE_MS,
	PUSH_PAIR_HOURLY_CAP,
	PUSH_RECIPIENT_HOURLY_CAP,
} from "./drain";
import type { PushMessage, PushSendResult } from "./fcm";
import { PUSH_BATCH_WINDOW_MS } from "./outbox";
import { loadPushPreferences, updatePushPreferences } from "./preferences";
import { registerPushToken } from "./tokens";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));

const hasDb = Boolean(process.env.DATABASE_URL);
const FAKE_CREDENTIAL = Buffer.from(
	JSON.stringify({
		project_id: "test",
		client_email: "push@test.iam.gserviceaccount.com",
		private_key: "unused",
		token_uri: "https://oauth2.googleapis.com/token",
	}),
).toString("base64");

describe.skipIf(!hasDb)("push outbox (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const names = ["alice", "bob", "carol", "dave"] as const;
	const id = Object.fromEntries(names.map((n) => [n, `test-push-${n}-${run}`])) as Record<
		(typeof names)[number],
		string
	>;
	const all = Object.values(id);
	const { alice, bob, carol, dave } = id;
	const aliceToken = `fcm-alice-${run}`;
	const aliceSession = `sess-push-${alice}`;
	let readId = "";
	const bookOf: Record<string, string> = {};

	const sent: { token: string; message: PushMessage }[] = [];
	let nextResult: PushSendResult = "sent";
	const send = vi.fn(async (token: string, _platform: string, message: PushMessage) => {
		sent.push({ token, message });
		return nextResult;
	});
	const drain = (at = new Date()) => drainPushOutbox(send, at);
	const afterWindow = () => new Date(Date.now() + PUSH_BATCH_WINDOW_MS + 1000);

	async function notify(actorId: string, type: NotificationType, subjectId: string = randomUUID()) {
		await db.transaction((tx) =>
			createNotification(tx, {
				recipientId: alice,
				actorId,
				type,
				subjectId,
			}),
		);
		return subjectId;
	}
	async function outboxRows() {
		return db.select().from(socialPushOutbox).where(inArray(socialPushOutbox.recipientId, all));
	}
	async function setPosition(userId: string, wordPosition: number) {
		await db
			.update(syncBooks)
			.set({ wordPosition })
			.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookOf[userId] ?? "")));
	}
	async function joinByInvite(userId: string) {
		const [item] = (await listInbox(userId, null)).items.filter(
			(i) => i.type === "buddy_read_invite",
		);
		const inviteId = item?.subject?.kind === "buddy_read_invite" ? item.subject.inviteId : "";
		const { bookId } = await respondToBuddyReadInvite(userId, inviteId, "accept");
		bookOf[userId] = bookId ?? "";
	}

	beforeAll(async () => {
		process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = FAKE_CREDENTIAL;
		const now = new Date();
		await db
			.insert(user)
			.values(all.map((u) => ({ id: u, name: `Name ${u}`, email: `${u}@example.test` })));
		for (const n of names) await claimHandle(id[n], `${n}_${run}`, n);
		for (const friend of [bob, carol, dave]) {
			await db.transaction((tx) => createFriendship(tx, alice, friend, now));
		}
		bookOf[alice] = "pppp0001";
		await db.insert(syncBooks).values({
			userId: alice,
			bookId: "pppp0001",
			originUserId: alice,
			originBookId: "pppp0001",
			title: "Pushed Book",
			content: "text",
			wordCount: 1000,
			wordPosition: 0,
			updatedAt: now,
		});
		({ buddyReadId: readId } = await createBuddyRead(alice, {
			bookId: "pppp0001",
			inviteeIds: [bob, carol],
		}));
		await joinByInvite(bob);
		await joinByInvite(carol);
		await setPosition(bob, 1000);
		await setPosition(carol, 1000);
		await db.insert(session).values({
			id: aliceSession,
			token: `tok-${alice}`,
			userId: alice,
			expiresAt: new Date(now.getTime() + 7 * 86_400_000),
			updatedAt: now,
		});
	});

	beforeEach(async () => {
		sent.length = 0;
		send.mockClear();
		nextResult = "sent";
		await db.delete(socialPushOutbox).where(inArray(socialPushOutbox.recipientId, all));
		await db.delete(socialPushSent).where(inArray(socialPushSent.recipientId, all));
		await db.delete(socialPushPreferences).where(inArray(socialPushPreferences.userId, all));
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		await registerPushToken({
			token: aliceToken,
			platform: "android",
			userId: alice,
			sessionId: aliceSession,
		});
	});

	afterAll(async () => {
		delete process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
		await db.delete(buddyRead).where(inArray(buddyRead.originUserId, all));
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		await db.delete(syncBookCopy).where(inArray(syncBookCopy.userId, all));
		await db.delete(syncBooks).where(inArray(syncBooks.userId, all));
		await db.delete(user).where(inArray(user.id, all));
		const rows = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = rows.map((r) => r.handle).filter((h) => h.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	test("an inbox event is pushed once with the actor's name, a fixed text and its route", async () => {
		await notify(bob, "friend_request_accepted");
		await drain();
		await drain();

		expect(sent).toHaveLength(1);
		const [inboxItem] = (await listInbox(alice, null)).items;
		expect(sent[0]).toEqual({
			token: aliceToken,
			message: expect.objectContaining({
				title: "bob",
				body: "Accepted your friend request",
				data: { route: "/tabs/social/inbox", inboxItemId: inboxItem?.id },
			}),
		});
		const payload = JSON.stringify(sent[0]?.message);
		for (const secret of [bob, alice, `${bob}@example.test`]) {
			expect(payload).not.toContain(secret);
		}
		expect(await outboxRows()).toHaveLength(0);
	});

	test("unmapped types and events without an actor are never queued", async () => {
		await notify(bob, "share_removed");
		await db.transaction((tx) =>
			createNotification(tx, {
				recipientId: alice,
				actorId: null,
				type: "statement_of_reasons",
				payload: { text: "x" },
			}),
		);
		expect(await outboxRows()).toHaveLength(0);
	});

	test("without push credentials nothing is queued", async () => {
		delete process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
		try {
			await notify(bob, "friend_request_accepted");
			expect(await outboxRows()).toHaveLength(0);
		} finally {
			process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = FAKE_CREDENTIAL;
		}
	});

	test("a disabled category is not pushed but stays in the inbox", async () => {
		await db.insert(socialPushPreferences).values({ userId: alice, friendRequests: false });
		await notify(bob, "friend_request_accepted");
		await drain();

		expect(sent).toHaveLength(0);
		expect(await outboxRows()).toHaveLength(0);
		expect((await listInbox(alice, null)).items).toHaveLength(1);
	});

	test("an item read before the send is not pushed", async () => {
		await notify(bob, "friend_request_accepted");
		const [item] = (await listInbox(alice, null)).items;
		await markRead(alice, item?.id ?? "");
		await drain();
		expect(sent).toHaveLength(0);
	});

	test("an unfriend before the send silences a friends-only event", async () => {
		await notify(carol, "friend_request_accepted");
		const [low, high] = orderedPair(alice, carol);
		await db
			.delete(socialFriendship)
			.where(and(eq(socialFriendship.userLow, low), eq(socialFriendship.userHigh, high)));
		try {
			await drain();
			expect(sent).toHaveLength(0);
		} finally {
			await db.transaction((tx) => createFriendship(tx, alice, carol, new Date()));
		}
	});

	test("a block before the send silences the push", async () => {
		await notify(dave, "friend_request_accepted");
		await blockUser(alice, dave);
		await drain();
		expect(sent).toHaveLength(0);
		expect(await outboxRows()).toHaveLength(0);
	});

	test("a sender past the pair cap stays inbox-only while others still push", async () => {
		await db.insert(socialPushSent).values(
			Array.from({ length: PUSH_PAIR_HOURLY_CAP }, () => ({
				recipientId: alice,
				actorId: bob,
				sentAt: new Date(),
			})),
		);
		await notify(bob, "friend_request_accepted");
		await notify(carol, "friend_request_accepted");
		await drain();
		expect(sent.map((s) => s.message.title)).toEqual(["carol"]);
		expect((await listInbox(alice, null)).items).toHaveLength(2);
	});

	test("a recipient past the hourly cap gets no push, even from a new sender", async () => {
		// Booked to the recipient as actor, so no real sender's pair cap is anywhere near.
		await db.insert(socialPushSent).values(
			Array.from({ length: PUSH_RECIPIENT_HOURLY_CAP }, () => ({
				recipientId: alice,
				actorId: alice,
				sentAt: new Date(),
			})),
		);
		await notify(carol, "friend_request_accepted");
		await drain();
		expect(sent).toHaveLength(0);
		expect((await listInbox(alice, null)).items).toHaveLength(1);
	});

	test("an event repeated while its push is being sent is sent again, not lost", async () => {
		const subjectId = await notify(bob, "friend_request_accepted");
		send.mockImplementationOnce(async (token, _platform, message) => {
			sent.push({ token, message });
			await notify(bob, "friend_request_accepted", subjectId);
			return "sent";
		});
		await drain();
		expect(sent).toHaveLength(1);
		const [pending] = await outboxRows();
		expect(pending?.sendAfter.getTime()).toBeLessThanOrEqual(Date.now());
	});

	test("an oversized display name is clipped in the title", async () => {
		await db
			.update(user)
			.set({ name: "😀".repeat(5000) })
			.where(eq(user.id, bob));
		try {
			await notify(bob, "friend_request_accepted");
			await drain();
			const title = Array.from(sent[0]?.message.title ?? "");
			expect(title).toHaveLength(DISPLAY_NAME_MAX_LENGTH);
			expect(title.at(-1)).toBe("…");
		} finally {
			await db.update(user).set({ name: "bob" }).where(eq(user.id, bob));
		}
	});

	test("a push not sent within 24 hours is dropped", async () => {
		await notify(bob, "friend_request_accepted");
		await drain(new Date(Date.now() + PUSH_MAX_AGE_MS + 60_000));
		expect(sent).toHaveLength(0);
		expect(await outboxRows()).toHaveLength(0);
	});

	test("a token FCM rejects is deleted, and a failed send is retried later", async () => {
		nextResult = "failed";
		await notify(bob, "friend_request_accepted");
		await drain();
		expect(sent).toHaveLength(1);
		const [pending] = await outboxRows();
		expect(pending?.sendAfter.getTime()).toBeGreaterThan(Date.now());

		nextResult = "invalid_token";
		await drain(new Date(Date.now() + 2 * 60_000));
		expect(sent).toHaveLength(2);
		expect(await outboxRows()).toHaveLength(0);
		const tokens = await db
			.select()
			.from(socialPushToken)
			.where(eq(socialPushToken.token, aliceToken));
		expect(tokens).toHaveLength(0);
	});

	test("a token whose session expired gets nothing and is removed", async () => {
		await db
			.update(session)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(session.id, aliceSession));
		try {
			await notify(bob, "friend_request_accepted");
			await drain();
			expect(sent).toHaveLength(0);
			expect(
				await db.select().from(socialPushToken).where(eq(socialPushToken.userId, alice)),
			).toHaveLength(0);
		} finally {
			await db
				.update(session)
				.set({ expiresAt: new Date(Date.now() + 86_400_000) })
				.where(eq(session.id, aliceSession));
		}
	});

	test("a token whose session expired is swept even when nothing is sent", async () => {
		await db
			.update(session)
			.set({ expiresAt: new Date(Date.now() - 1000) })
			.where(eq(session.id, aliceSession));
		try {
			await drain();
			expect(
				await db.select().from(socialPushToken).where(eq(socialPushToken.userId, alice)),
			).toHaveLength(0);
		} finally {
			await db
				.update(session)
				.set({ expiresAt: new Date(Date.now() + 86_400_000) })
				.where(eq(session.id, aliceSession));
		}
	});

	test("two drains running at once send a row only once", async () => {
		await notify(bob, "friend_request_accepted");
		await Promise.all([drain(), drain()]);
		expect(sent).toHaveLength(1);
	});

	test("a buddy-read title is left out when the actor hid the book from their profile", async () => {
		await notify(bob, "buddy_read_joined", readId);
		await drain();
		expect(sent[0]?.message).toMatchObject({
			body: "Joined your buddy read of “Pushed Book”",
			data: { route: `/tabs/social/buddy-read/${readId}` },
		});

		await db
			.update(syncBooks)
			.set({ hideFromProfile: true })
			.where(and(eq(syncBooks.userId, bob), eq(syncBooks.bookId, bookOf[bob] ?? "")));
		try {
			await db.delete(socialNotification).where(eq(socialNotification.recipientId, alice));
			await notify(bob, "buddy_read_joined", readId);
			await drain();
			expect(sent[1]?.message.body).toBe("Joined your buddy read");
		} finally {
			await db
				.update(syncBooks)
				.set({ hideFromProfile: false })
				.where(and(eq(syncBooks.userId, bob), eq(syncBooks.bookId, bookOf[bob] ?? "")));
		}
	});

	describe("discussion", () => {
		const range = {
			kind: "range" as const,
			startWord: 300,
			startCharInWord: 0,
			endWord: 320,
			endCharInWord: 0,
		};
		const longReply = `Spoiler ${"x".repeat(200)}`;

		test("replies within the window collapse into one push, previewing only what the reader reached", async () => {
			const { commentId } = await postComment(alice, {
				buddyReadId: readId,
				anchor: range,
				body: "What do you think?",
			});
			await replyToComment(bob, { parentId: commentId, body: "First" });
			await replyToComment(carol, { parentId: commentId, body: longReply });
			await drain();
			expect(sent).toHaveLength(0);
			expect(await outboxRows()).toHaveLength(1);

			await drain(afterWindow());
			expect(sent).toHaveLength(1);
			expect(sent[0]?.message).toMatchObject({
				title: "carol and 1 other",
				body: "Replied to your comment",
				tag: `buddy_read_reply:${commentId}`,
				data: { route: `/tabs/social/buddy-read-discussion/${readId}` },
			});

			await setPosition(alice, 320);
			await replyToComment(bob, { parentId: commentId, body: longReply });
			await drain(afterWindow());
			const preview = sent[1]?.message.body ?? "";
			expect(preview.length).toBe(PUSH_PREVIEW_MAX_CHARS);
			expect(preview.startsWith("Spoiler x")).toBe(true);

			await db.insert(socialPushPreferences).values({ userId: alice, previews: false });
			await replyToComment(carol, { parentId: commentId, body: "No preview" });
			await drain(afterWindow());
			expect(sent[2]?.message.body).toBe("Replied to your comment");
		});

		test("a reply that arrives while its batched push is being sent gets a push of its own", async () => {
			const { commentId } = await postComment(alice, {
				buddyReadId: readId,
				anchor: range,
				body: "Mid-send",
			});
			await replyToComment(bob, { parentId: commentId, body: "First" });
			send.mockImplementationOnce(async (token, _platform, message) => {
				sent.push({ token, message });
				await replyToComment(carol, { parentId: commentId, body: "Second" });
				return "sent";
			});
			await drain(afterWindow());
			expect(sent).toHaveLength(1);
			expect(await outboxRows()).toHaveLength(1);

			await drain(new Date(Date.now() + 2 * PUSH_BATCH_WINDOW_MS + 2000));
			expect(sent).toHaveLength(2);
			expect(sent[1]?.message.title).toBe("carol and 1 other");
		});

		test("a reaction is pushed with its own text", async () => {
			const { commentId } = await postComment(alice, {
				buddyReadId: readId,
				anchor: range,
				body: "React to me",
			});
			await addReaction(bob, { commentId, emoji: "👍" });
			await drain(afterWindow());
			expect(sent[0]?.message).toMatchObject({ title: "bob", body: "Reacted to your comment" });
		});
	});

	test("preferences default to all on and a partial update keeps the other keys", async () => {
		expect(await loadPushPreferences(db, alice)).toEqual(DEFAULT_PUSH_PREFERENCES);
		await updatePushPreferences(alice, { shares: false });
		const updated = await updatePushPreferences(alice, { previews: false });
		expect(updated).toEqual({ ...DEFAULT_PUSH_PREFERENCES, shares: false, previews: false });
	});

	test("deleting the account removes its queued pushes, preferences and send log", async () => {
		await notify(carol, "friend_request_accepted");
		await db.insert(socialPushPreferences).values({ userId: carol });
		await db.insert(socialPushSent).values({ recipientId: alice, actorId: carol });
		await db.delete(user).where(eq(user.id, carol));

		const left = await db
			.select()
			.from(socialPushOutbox)
			.where(or(eq(socialPushOutbox.actorId, carol), eq(socialPushOutbox.recipientId, carol)));
		expect(left).toHaveLength(0);
		expect(
			await db.select().from(socialPushSent).where(eq(socialPushSent.actorId, carol)),
		).toHaveLength(0);
		expect(
			await db.select().from(socialPushPreferences).where(eq(socialPushPreferences.userId, carol)),
		).toHaveLength(0);
	});
});
