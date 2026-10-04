// @vitest-environment node
//
// Account-deletion smoke test against a real Postgres database. Skipped when
// DATABASE_URL is unset (e.g. CI without a DB) so it never breaks `pnpm test`.
// Run locally with:
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/rsvp pnpm test account-deletion
import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { afterAll, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { account, session, user } from "~/db/auth-schema";
import {
	buddyRead,
	buddyReadComment,
	buddyReadMember,
	buddyReadReaction,
	buddyReadSharedHighlight,
	socialAvatar,
	socialBlock,
	socialFeedEvent,
	socialFriendRequest,
	socialFriendship,
	socialHandle,
	socialInvite,
	socialNotice,
	socialNotification,
	socialProfile,
	socialPushOutbox,
	socialPushPreferences,
	socialPushSent,
	socialPushToken,
	socialRestriction,
	socialShare,
	socialShareConsent,
	socialTakedown,
	syncBookCopy,
	syncBooks,
	syncGlossaryEntries,
	syncHighlights,
	syncReadingSessions,
	syncSeries,
	syncSettings,
} from "~/db/schema";
import { deleteUserAccount, purgeCloudData } from "./account-deletion";
import { deleteAdminUser } from "./admin";
import { claimHandle } from "./social/handle";
import { orderedPair } from "./social/relationship";

// Server functions only run inside the Start runtime, so this shim calls the
// handler directly with the validated input; the handler and its admin check are real.
vi.mock("@tanstack/react-start", () => {
	type Opts = { data?: unknown };
	const builder = (validate: (d: unknown) => unknown = (d) => d) => ({
		inputValidator: (v: (d: unknown) => unknown) => builder(v),
		handler:
			(fn: (ctx: { data: unknown }) => unknown) =>
			(opts: Opts = {}) =>
				fn({ data: validate(opts.data) }),
	});
	return { createServerFn: () => builder(), createServerOnlyFn: <T>(fn: T) => fn };
});
vi.mock("@tanstack/react-start/server", () => ({
	getRequest: () => new Request("https://lesefluss.test"),
}));
const adminSession = vi.hoisted(() => ({ role: "admin" }));
vi.mock("./auth", () => ({
	auth: {
		api: { getSession: async () => ({ user: { id: "test-admin", role: adminSession.role } }) },
	},
}));

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("deleteUserAccount (integration)", () => {
	const userId = `test-del-${randomUUID()}`;
	const now = new Date();
	const future = new Date(now.getTime() + 60 * 60 * 1000);

	const handle = `del_${userId.slice(-8)}`;
	const otherUserId = `test-del-other-${randomUUID()}`;

	// Cleanup in case an assertion fails mid-test and leaves rows behind.
	afterAll(async () => {
		await deleteUserAccount(userId).catch(() => {});
		await deleteUserAccount(otherUserId).catch(() => {});
		await db.delete(socialHandle).where(eq(socialHandle.handle, handle));
	});

	test("deletes an OAuth (password-less) user and all associated data", async () => {
		// A Google user with no password is the shape the old password-required
		// flow could not delete.
		await db.insert(user).values({
			id: userId,
			name: "Delete Me",
			email: `${userId}@example.test`,
		});
		await db.insert(account).values({
			id: `acc-${userId}`,
			accountId: `google-${userId}`,
			providerId: "google",
			userId,
		});
		await db.insert(session).values({
			id: `sess-${userId}`,
			token: `tok-${userId}`,
			userId,
			expiresAt: future,
			updatedAt: now,
		});

		// One row in every user-scoped sync table.
		await db.insert(syncBooks).values({
			userId,
			bookId: "book1",
			originUserId: userId,
			originBookId: "book1",
			title: "B",
			updatedAt: now,
		});
		await db.insert(syncSeries).values({
			userId,
			seriesId: "series1",
			title: "S",
			sourceUrl: "https://x.test",
			tocUrl: "https://x.test/toc",
			provider: "ao3",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(syncSettings).values({ userId, updatedAt: now });
		await db.insert(syncHighlights).values({
			userId,
			highlightId: "hl1",
			bookId: "book1",
			startWord: 0,
			endWord: 1,
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(syncGlossaryEntries).values({
			userId,
			entryId: "g1",
			label: "L",
			color: "yellow",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(syncReadingSessions).values({
			userId,
			sessionId: "rs1",
			bookId: "book1",
			mode: "rsvp",
			startedAt: now,
			endedAt: now,
			durationMs: 1000,
			wordsRead: 10,
			startWord: 0,
			endWord: 10,
			updatedAt: now,
		});

		// Social rows: profile, avatar, an active handle, and a friend graph in
		// both directions with another user.
		await claimHandle(userId, handle, "Delete Me");
		await db.insert(socialAvatar).values({ userId, data: Buffer.from("webp-bytes") });
		await db.insert(user).values({
			id: otherUserId,
			name: "Other",
			email: `${otherUserId}@example.test`,
		});
		const [low, high] = userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
		await db.insert(socialFriendship).values({ userLow: low, userHigh: high });
		await db.insert(socialFriendRequest).values([
			{ requesterId: userId, addresseeId: otherUserId },
			{ requesterId: otherUserId, addresseeId: userId, state: "declined", resolvedAt: now },
		]);
		await db.insert(socialBlock).values([
			{ blockerId: userId, blockedId: otherUserId },
			{ blockerId: otherUserId, blockedId: userId },
		]);
		await db.insert(socialInvite).values({
			ownerId: userId,
			token: `tok-${userId}`,
			expiresAt: future,
		});
		await db.insert(socialNotification).values([
			{ recipientId: userId, actorId: otherUserId, type: "friend_request_accepted" },
			{ recipientId: otherUserId, actorId: userId, type: "friend_request_accepted" },
		]);
		// Moderation rows: a notice the user filed, a notice about them, a
		// restriction on them and a takedown of one of their books.
		const [filed] = await db
			.insert(socialNotice)
			.values({
				targetType: "profile",
				targetRef: "someone",
				targetUserId: otherUserId,
				reason: "spam",
				text: "filed by the deleted user",
				source: "app",
				notifierUserId: userId,
			})
			.returning({ id: socialNotice.id });
		const [about] = await db
			.insert(socialNotice)
			.values({
				targetType: "profile",
				targetRef: handle,
				targetUserId: userId,
				reason: "spam",
				text: "about the deleted user",
				source: "web",
				notifierName: "Someone",
				notifierEmail: "someone@example.test",
			})
			.returning({ id: socialNotice.id });
		await db.insert(socialRestriction).values({
			userId,
			kind: "sharing_suspended",
			reason: "test",
			createdBy: "admin",
		});
		await db.insert(socialTakedown).values({ scope: "copy", userId, bookId: "book1" });
		// Sharing rows: an offer each way, a consent, a copy record, and a copy the
		// other user accepted from this one.
		await db.insert(socialShare).values([
			{
				senderId: userId,
				recipientId: otherUserId,
				bookId: "book1",
				originUserId: userId,
				originBookId: "book1",
				title: "B",
			},
			{
				senderId: otherUserId,
				recipientId: userId,
				bookId: "other1",
				originUserId: otherUserId,
				originBookId: "other1",
				title: "O",
			},
		]);
		await db.insert(socialShareConsent).values({ userId });
		await db.insert(syncBookCopy).values({
			userId,
			bookId: "book1",
			originUserId: otherUserId,
			originBookId: "other1",
			via: "share",
		});
		await db.insert(syncBooks).values({
			userId: otherUserId,
			bookId: "copy0001",
			originUserId: userId,
			originBookId: "book1",
			title: "B",
			content: "text",
			updatedAt: now,
		});

		await db.insert(socialFeedEvent).values({ actorId: userId, bookId: "book1", type: "started" });

		// Push: the device token, preferences, a queued push and the send log, as recipient and as actor.
		await db.insert(socialPushToken).values({
			token: `fcm-${userId}`,
			platform: "android",
			userId,
			sessionId: `sess-${userId}`,
		});
		await db.insert(socialPushPreferences).values({ userId, shares: false });
		await db.insert(socialPushOutbox).values([
			{
				dedupeKey: `in-${userId}`,
				recipientId: userId,
				actorId: otherUserId,
				type: "friend_request_accepted",
				subjectId: "s1",
				sendAfter: now,
			},
			{
				dedupeKey: `out-${userId}`,
				recipientId: otherUserId,
				actorId: userId,
				type: "friend_request_accepted",
				subjectId: "s2",
				sendAfter: now,
			},
		]);
		await db.insert(socialPushSent).values([
			{ recipientId: userId, actorId: otherUserId },
			{ recipientId: otherUserId, actorId: userId },
		]);

		// Act.
		await deleteUserAccount(userId);

		expect(
			await db.select().from(socialPushToken).where(eq(socialPushToken.userId, userId)),
		).toHaveLength(0);
		expect(
			await db.select().from(socialPushPreferences).where(eq(socialPushPreferences.userId, userId)),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(socialPushOutbox)
				.where(or(eq(socialPushOutbox.recipientId, userId), eq(socialPushOutbox.actorId, userId))),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(socialPushSent)
				.where(or(eq(socialPushSent.recipientId, userId), eq(socialPushSent.actorId, userId))),
		).toHaveLength(0);

		expect(
			await db.select().from(socialFeedEvent).where(eq(socialFeedEvent.actorId, userId)),
		).toHaveLength(0);

		// Sharing: every record naming the user is gone; the other user's copy stays.
		expect(
			await db
				.select()
				.from(socialShare)
				.where(or(eq(socialShare.senderId, userId), eq(socialShare.recipientId, userId))),
		).toHaveLength(0);
		expect(
			await db.select().from(socialShareConsent).where(eq(socialShareConsent.userId, userId)),
		).toHaveLength(0);
		expect(
			await db.select().from(syncBookCopy).where(eq(syncBookCopy.userId, userId)),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(syncBooks)
				.where(and(eq(syncBooks.userId, otherUserId), eq(syncBooks.bookId, "copy0001"))),
		).toMatchObject([{ deleted: false, originUserId: userId, originBookId: "book1" }]);
		await db.delete(syncBooks).where(eq(syncBooks.userId, otherUserId));

		// Moderation: restrictions gone, the filed notice keeps no identity, both
		// notices and the takedown record stay.
		expect(
			await db.select().from(socialRestriction).where(eq(socialRestriction.userId, userId)),
		).toHaveLength(0);
		const [filedAfter] = await db
			.select()
			.from(socialNotice)
			.where(eq(socialNotice.id, filed?.id ?? ""));
		expect(filedAfter).toMatchObject({
			notifierUserId: null,
			notifierName: null,
			notifierEmail: null,
			text: "filed by the deleted user",
		});
		expect(
			await db
				.select()
				.from(socialNotice)
				.where(eq(socialNotice.id, about?.id ?? "")),
		).toHaveLength(1);
		expect(
			await db.select().from(socialTakedown).where(eq(socialTakedown.userId, userId)),
		).toHaveLength(1);
		await db
			.delete(socialNotice)
			.where(inArray(socialNotice.id, [filed?.id ?? "", about?.id ?? ""]));
		await db.delete(socialTakedown).where(eq(socialTakedown.userId, userId));

		// User row gone.
		expect(await db.select().from(user).where(eq(user.id, userId))).toHaveLength(0);
		// Cascade removed session + account (FK onDelete: "cascade").
		expect(await db.select().from(session).where(eq(session.userId, userId))).toHaveLength(0);
		expect(await db.select().from(account).where(eq(account.userId, userId))).toHaveLength(0);
		// All six sync tables purged.
		expect(await db.select().from(syncBooks).where(eq(syncBooks.userId, userId))).toHaveLength(0);
		expect(await db.select().from(syncSeries).where(eq(syncSeries.userId, userId))).toHaveLength(0);
		expect(
			await db.select().from(syncSettings).where(eq(syncSettings.userId, userId)),
		).toHaveLength(0);
		expect(
			await db.select().from(syncHighlights).where(eq(syncHighlights.userId, userId)),
		).toHaveLength(0);
		expect(
			await db.select().from(syncGlossaryEntries).where(eq(syncGlossaryEntries.userId, userId)),
		).toHaveLength(0);
		expect(
			await db.select().from(syncReadingSessions).where(eq(syncReadingSessions.userId, userId)),
		).toHaveLength(0);

		// Social profile and avatar cascade from the user row.
		expect(
			await db.select().from(socialProfile).where(eq(socialProfile.userId, userId)),
		).toHaveLength(0);
		expect(
			await db.select().from(socialAvatar).where(eq(socialAvatar.userId, userId)),
		).toHaveLength(0);
		// The handle stays as an ownerless hold that nobody can claim for 90 days.
		const [held] = await db.select().from(socialHandle).where(eq(socialHandle.handle, handle));
		expect(held).toMatchObject({ userId: null, reclaimable: false });
		expect(held?.releasedAt).not.toBeNull();
		// Friend graph rows referencing the user from either side are gone.
		expect(
			await db
				.select()
				.from(socialFriendship)
				.where(or(eq(socialFriendship.userLow, userId), eq(socialFriendship.userHigh, userId))),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(socialFriendRequest)
				.where(
					or(
						eq(socialFriendRequest.requesterId, userId),
						eq(socialFriendRequest.addresseeId, userId),
					),
				),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(socialBlock)
				.where(or(eq(socialBlock.blockerId, userId), eq(socialBlock.blockedId, userId))),
		).toHaveLength(0);
		expect(
			await db.select().from(socialInvite).where(eq(socialInvite.ownerId, userId)),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(socialNotification)
				.where(
					or(eq(socialNotification.recipientId, userId), eq(socialNotification.actorId, userId)),
				),
		).toHaveLength(0);
		await expect(claimHandle(otherUserId, handle, "Other")).rejects.toMatchObject({
			code: "taken",
		});

		// Isolation: the other party is untouched. (Test files run in parallel and
		// create users of their own, so a global count would be racy.)
		expect(await db.select().from(user).where(eq(user.id, otherUserId))).toHaveLength(1);
	});

	test("removes the user's buddy-read reactions and shares and anonymises threaded comments", async () => {
		const leaver = `test-del-br-${randomUUID()}`;
		const stayer = `test-del-br-other-${randomUUID()}`;
		await db.insert(user).values([
			{ id: leaver, name: "Leaver", email: `${leaver}@example.test` },
			{ id: stayer, name: "Stayer", email: `${stayer}@example.test` },
		]);
		const [read] = await db
			.insert(buddyRead)
			.values({ originUserId: stayer, originBookId: "book1", hostId: stayer, title: "B" })
			.returning({ id: buddyRead.id });
		const buddyReadId = read?.id ?? "";
		await db.insert(buddyReadMember).values([
			{ buddyReadId, userId: leaver, bookId: "book1", state: "left", leftAt: now },
			{ buddyReadId, userId: stayer, bookId: "book1" },
		]);
		const anchor = { anchorKind: "range" as const, startWord: 5, endWord: 6 };
		const [lone, threaded] = await db
			.insert(buddyReadComment)
			.values([
				{ buddyReadId, authorId: leaver, ...anchor, body: "lone" },
				{ buddyReadId, authorId: leaver, ...anchor, body: "threaded" },
			])
			.returning({ id: buddyReadComment.id });
		const [reply] = await db
			.insert(buddyReadComment)
			.values({ buddyReadId, authorId: stayer, parentId: threaded?.id, ...anchor, body: "reply" })
			.returning({ id: buddyReadComment.id });
		await db
			.insert(buddyReadSharedHighlight)
			.values({ buddyReadId, userId: leaver, highlightId: "hl1" });
		await db
			.insert(buddyReadReaction)
			.values({ buddyReadId, userId: leaver, commentId: reply?.id, emoji: "👍" });

		await deleteUserAccount(leaver);

		expect(
			await db
				.select()
				.from(buddyReadComment)
				.where(eq(buddyReadComment.id, lone?.id ?? "")),
		).toHaveLength(0);
		const [placeholder] = await db
			.select()
			.from(buddyReadComment)
			.where(eq(buddyReadComment.id, threaded?.id ?? ""));
		expect(placeholder).toMatchObject({ body: null, authorId: null });
		expect(placeholder?.deletedAt).not.toBeNull();
		expect(
			await db
				.select()
				.from(buddyReadComment)
				.where(eq(buddyReadComment.id, reply?.id ?? "")),
		).toMatchObject([{ body: "reply", authorId: stayer }]);
		expect(
			await db
				.select()
				.from(buddyReadSharedHighlight)
				.where(eq(buddyReadSharedHighlight.userId, leaver)),
		).toHaveLength(0);
		expect(
			await db.select().from(buddyReadReaction).where(eq(buddyReadReaction.userId, leaver)),
		).toHaveLength(0);

		await db.delete(buddyRead).where(eq(buddyRead.id, buddyReadId));
		await deleteUserAccount(stayer);
	});

	test("clearing cloud data keeps the social profile", async () => {
		const id = `test-clear-${randomUUID()}`;
		const clearHandle = `cl_${id.slice(-8)}`;
		await db.insert(user).values({ id, name: "Keep", email: `${id}@example.test` });
		await claimHandle(id, clearHandle, "Keep");
		await db.insert(syncSettings).values({ userId: id, updatedAt: now });
		await db.transaction((tx) => purgeCloudData(tx, id));
		const [profile] = await db.select().from(socialProfile).where(eq(socialProfile.userId, id));
		expect(profile?.handle).toBe(clearHandle);
		await deleteUserAccount(id);
		await db.delete(socialHandle).where(eq(socialHandle.handle, clearHandle));
	});

	test("an admin deletes a user through deleteAdminUser, social data included; a non-admin cannot", async () => {
		const id = `test-admdel-${randomUUID()}`;
		const friend = `test-admdel-f-${randomUUID()}`;
		const idHandle = `ad_${id.slice(-8)}`;
		await db.insert(user).values([
			{ id, name: "Target", email: `${id}@example.test` },
			{ id: friend, name: "Friend", email: `${friend}@example.test` },
		]);
		await claimHandle(id, idHandle, "Target");
		const [userLow, userHigh] = orderedPair(id, friend);
		await db.insert(socialFriendship).values({ userLow, userHigh, acceptedAt: now });
		await db.insert(socialFeedEvent).values({ actorId: id, bookId: "b1", type: "started" });
		await db.insert(syncBooks).values({
			userId: id,
			bookId: "b1",
			originUserId: id,
			originBookId: "b1",
			title: "B",
			updatedAt: now,
		});
		const rowsOf = async () => ({
			user: await db.select().from(user).where(eq(user.id, id)),
			profile: await db.select().from(socialProfile).where(eq(socialProfile.userId, id)),
			friendship: await db
				.select()
				.from(socialFriendship)
				.where(or(eq(socialFriendship.userLow, id), eq(socialFriendship.userHigh, id))),
			feed: await db.select().from(socialFeedEvent).where(eq(socialFeedEvent.actorId, id)),
			books: await db.select().from(syncBooks).where(eq(syncBooks.userId, id)),
		});

		try {
			adminSession.role = "user";
			await expect(deleteAdminUser({ data: { userId: id } })).rejects.toMatchObject({
				status: 403,
			});
			for (const rows of Object.values(await rowsOf())) expect(rows).toHaveLength(1);

			adminSession.role = "admin";
			expect(await deleteAdminUser({ data: { userId: id } })).toEqual({ success: true });
			for (const rows of Object.values(await rowsOf())) expect(rows).toEqual([]);
			const [held] = await db.select().from(socialHandle).where(eq(socialHandle.handle, idHandle));
			expect(held?.userId).toBeNull();
			expect(held?.releasedAt).not.toBeNull();
			expect(await db.select().from(user).where(eq(user.id, friend))).toHaveLength(1);
		} finally {
			adminSession.role = "admin";
			await deleteUserAccount(id).catch(() => {});
			await deleteUserAccount(friend).catch(() => {});
			await db.delete(socialHandle).where(eq(socialHandle.handle, idHandle));
		}
	});
});
