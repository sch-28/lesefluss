// @vitest-environment node
//
// Book sharing against a real Postgres database. Skipped when DATABASE_URL is unset.
// The tests build on each other's state in file order (one share flows through
// offer, revoke, decline, accept, takedown); run the file, not single tests.
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import {
	socialHandle,
	socialNotice,
	socialNotification,
	socialRestriction,
	socialShare,
	socialShareConsent,
	socialTakedown,
	syncBookCopy,
	syncBooks,
	syncHighlights,
} from "~/db/schema";
import { deleteUserAccount } from "~/lib/account-deletion";
import { decideNotice } from "~/lib/moderation/decide";
import { createNotice } from "~/lib/moderation/notices";
import { suspendSharing } from "~/lib/moderation/restrictions";
import { isOriginTakenDown, takenDownBookIds } from "~/lib/moderation/takedown";
import { copyBookForUser } from "./copy-book";
import { blockUser, createFriendship, removeFriend, unblockUser } from "./friends";
import { claimHandle } from "./handle";
import { listInbox, unreadCount } from "./inbox";
import { createShare, listSharesForBook, respondToShare, revokeShare } from "./shares";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));
vi.mock("./buddy-read-eligibility", () => ({ sharesActiveBuddyRead: vi.fn(async () => true) }));

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY_MS = 86_400_000;
const ban = { ban: vi.fn(async () => {}), unban: vi.fn(async () => {}) };

describe.skipIf(!hasDb)("book sharing (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const alice = `test-share-a-${run}`;
	const bob = `test-share-b-${run}`;
	const carol = `test-share-c-${run}`;
	const dave = `test-share-d-${run}`;
	const all = [alice, bob, carol, dave];
	const now = new Date();

	async function book(userId: string, bookId: string) {
		const [row] = await db
			.select()
			.from(syncBooks)
			.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookId)));
		return row;
	}
	async function booksOf(userId: string) {
		return db.select().from(syncBooks).where(eq(syncBooks.userId, userId));
	}
	async function shareRow(id: string) {
		const [row] = await db.select().from(socialShare).where(eq(socialShare.id, id));
		return row;
	}
	async function befriend(a: string, b: string) {
		await db.transaction((tx) => createFriendship(tx, a, b, now));
	}
	async function pendingShare(sender: string, recipient: string, bookId: string) {
		const { shareId } = await createShare(sender, {
			recipientId: recipient,
			bookId,
			confirmRights: true,
		});
		return shareId;
	}

	beforeAll(async () => {
		process.env.BETTER_AUTH_SECRET ??= "test-secret";
		process.env.BETTER_AUTH_URL ??= "https://lesefluss.test";
		await db
			.insert(user)
			.values(all.map((id) => ({ id, name: `Name ${id}`, email: `${id}@example.test` })));
		for (const [id, handle] of [
			[alice, "alice"],
			[bob, "bob"],
			[carol, "carol"],
			[dave, "dave"],
		] as const) {
			await claimHandle(id, `${handle}_${run}`, handle);
		}
		await befriend(alice, bob);
		await befriend(bob, carol);
		await db.insert(syncBooks).values([
			{
				userId: alice,
				bookId: "aaaa1111",
				originUserId: alice,
				originBookId: "aaaa1111",
				title: "Moby-Dick",
				author: "Melville",
				fileSize: 12,
				wordCount: 3,
				wordPosition: 2,
				content: "Call me Ishmael.",
				coverImage: "data:image/png;base64,AAAA",
				chapters: '[{"title":"Loomings","startWord":0}]',
				linkRanges: '[{"href":"https://x.test","startWord":0,"endWord":1}]',
				description: "A whale",
				language: "en",
				source: "gutenberg",
				catalogId: "gutenberg:2701",
				sourceUrl: "https://gutenberg.org/2701",
				status: "reading",
				rating: 9,
				review: "private thoughts",
				tags: '["classic"]',
				hideFromProfile: true,
				finishedAt: now,
				addedAt: new Date(now.getTime() - 10 * DAY_MS),
				updatedAt: new Date(now.getTime() - DAY_MS),
				metadataUpdatedAt: new Date(now.getTime() - DAY_MS),
			},
			{
				userId: alice,
				bookId: "aaaa2222",
				originUserId: alice,
				originBookId: "aaaa2222",
				title: "No content yet",
				content: null,
				updatedAt: now,
			},
			{
				userId: alice,
				bookId: "aaaa3333",
				originUserId: alice,
				originBookId: "aaaa3333",
				title: "Chapter",
				content: "text",
				seriesId: "ssss0001",
				updatedAt: now,
			},
			{
				userId: alice,
				bookId: "aaaa4444",
				originUserId: alice,
				originBookId: "aaaa4444",
				title: "Gone",
				content: "text",
				deleted: true,
				updatedAt: now,
			},
		]);
		await db.insert(syncHighlights).values({
			userId: alice,
			highlightId: "hl-1",
			bookId: "aaaa1111",
			startWord: 0,
			endWord: 1,
			createdAt: now,
			updatedAt: now,
		});
	});

	afterAll(async () => {
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		await db.delete(socialShare).where(inArray(socialShare.senderId, all));
		await db.delete(socialShareConsent).where(inArray(socialShareConsent.userId, all));
		await db.delete(socialNotice).where(inArray(socialNotice.targetUserId, all));
		await db.delete(socialRestriction).where(inArray(socialRestriction.userId, all));
		await db.delete(socialTakedown).where(inArray(socialTakedown.userId, all));
		await db.delete(syncBookCopy).where(inArray(syncBookCopy.userId, all));
		await db.delete(syncHighlights).where(inArray(syncHighlights.userId, all));
		await db.delete(syncBooks).where(inArray(syncBooks.userId, all));
		await db.delete(user).where(inArray(user.id, all));
		const rows = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = rows.map((r) => r.handle).filter((h) => h.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	test("sharing is refused for the wrong recipient or the wrong book, each with its own reason", async () => {
		const attempt = (recipientId: string, bookId: string) =>
			createShare(alice, { recipientId, bookId, confirmRights: true });
		await expect(attempt(carol, "aaaa1111")).rejects.toMatchObject({ code: "not_found" });
		await expect(attempt(alice, "aaaa1111")).rejects.toMatchObject({ code: "not_found" });
		await expect(attempt(bob, "aaaa2222")).rejects.toMatchObject({ code: "not_shareable" });
		await expect(attempt(bob, "aaaa3333")).rejects.toMatchObject({ code: "not_shareable" });
		await expect(attempt(bob, "aaaa4444")).rejects.toMatchObject({ code: "not_shareable" });
		await expect(attempt(bob, "ffffffff")).rejects.toMatchObject({ code: "not_shareable" });
		await expect(
			createShare(alice, { recipientId: bob, bookId: "aaaa1111" }),
		).rejects.toMatchObject({ code: "consent_required" });
		expect(await db.select().from(socialShare).where(eq(socialShare.senderId, alice))).toHaveLength(
			0,
		);
	});

	test("the first share records consent once and creates an inbox item with the book card", async () => {
		const shareId = await pendingShare(alice, bob, "aaaa1111");
		const consent = await db
			.select()
			.from(socialShareConsent)
			.where(eq(socialShareConsent.userId, alice));
		expect(consent).toHaveLength(1);
		expect(consent[0]?.confirmedAt).toBeInstanceOf(Date);

		const inbox = await listInbox(bob, null);
		expect(inbox.items).toHaveLength(1);
		expect(inbox.items[0]).toMatchObject({
			type: "share_received",
			actor: { userId: alice, handle: `alice_${run}` },
			subject: {
				kind: "share",
				shareId,
				state: "pending",
				book: { title: "Moby-Dick", author: "Melville", wordCount: 3, cover: { kind: "catalog" } },
			},
		});
		expect(await unreadCount(bob)).toBe(1);
		expect(await listSharesForBook(alice, "aaaa1111")).toMatchObject([
			{ shareId, state: "pending", recipient: { userId: bob } },
		]);

		// A second offer of the same book to the same friend is refused while one is open.
		await expect(
			createShare(alice, { recipientId: bob, bookId: "aaaa1111" }),
		).rejects.toMatchObject({ code: "already_shared" });
	});

	test("revoking removes the recipient's item; a suspended sender is refused", async () => {
		const [open] = await listSharesForBook(alice, "aaaa1111");
		if (!open) throw new Error("expected an open share");
		await revokeShare(alice, open.shareId);
		expect((await shareRow(open.shareId))?.status).toBe("revoked");
		expect((await listInbox(bob, null)).items).toHaveLength(0);
		await expect(revokeShare(alice, open.shareId)).rejects.toMatchObject({ code: "not_found" });

		const restriction = await db.transaction((tx) =>
			suspendSharing(tx, {
				userId: alice,
				until: null,
				reason: "test",
				noticeId: null,
				createdBy: "admin",
				now,
			}),
		);
		await expect(
			createShare(alice, { recipientId: bob, bookId: "aaaa1111" }),
		).rejects.toMatchObject({ code: "suspended" });
		await db.delete(socialRestriction).where(eq(socialRestriction.id, restriction.id));
	});

	test("declining is silent, blocks a re-share for the cooldown, and expiry hides the offer", async () => {
		const shareId = await pendingShare(alice, bob, "aaaa1111");
		await respondToShare(bob, shareId, "decline");
		expect((await shareRow(shareId))?.status).toBe("declined");
		expect((await listInbox(alice, null)).items).toHaveLength(0);
		// The sender's book page cannot tell a decline from an unanswered offer.
		expect(await listSharesForBook(alice, "aaaa1111")).toMatchObject([
			{ shareId, state: "pending" },
		]);
		expect(
			await listSharesForBook(alice, "aaaa1111", new Date(now.getTime() + 31 * DAY_MS)),
		).toMatchObject([{ shareId, state: "expired" }]);
		const mine = await listInbox(bob, null);
		expect(mine.items[0]?.subject).toMatchObject({ kind: "share", state: "declined" });
		expect(mine.items[0]?.readAt).not.toBeNull();
		await expect(
			createShare(alice, { recipientId: bob, bookId: "aaaa1111" }),
		).rejects.toMatchObject({ code: "already_shared" });
		await expect(respondToShare(bob, shareId, "accept")).rejects.toMatchObject({
			code: "not_found",
		});
		// Withdrawing the declined offer closes it for the sender but keeps the cooldown.
		await revokeShare(alice, shareId);
		expect((await shareRow(shareId))?.status).toBe("expired");
		expect(await listSharesForBook(alice, "aaaa1111")).toHaveLength(0);
		await expect(
			createShare(alice, { recipientId: bob, bookId: "aaaa1111" }),
		).rejects.toMatchObject({ code: "already_shared" });

		// Past the cooldown the book can be offered again; that offer expires after 30 days.
		const later = new Date(now.getTime() + 31 * DAY_MS);
		const again = await createShare(alice, { recipientId: bob, bookId: "aaaa1111" }, later);
		const muchLater = new Date(later.getTime() + 31 * DAY_MS);
		// The unanswered offer still sits there as `pending`; a new offer closes it instead of colliding.
		const afterExpiry = await createShare(
			alice,
			{ recipientId: bob, bookId: "aaaa1111" },
			muchLater,
		);
		expect((await shareRow(again.shareId))?.status).toBe("expired");
		await db.delete(socialShare).where(eq(socialShare.id, afterExpiry.shareId));
		await db
			.update(socialShare)
			.set({ status: "pending", resolvedAt: null })
			.where(eq(socialShare.id, again.shareId));
		expect(await listSharesForBook(alice, "aaaa1111", muchLater)).toMatchObject([
			{ shareId: again.shareId, state: "expired" },
		]);
		expect((await listInbox(bob, null, muchLater)).items[0]?.subject).toMatchObject({
			state: "unavailable",
		});
		await expect(respondToShare(bob, again.shareId, "accept", muchLater)).rejects.toMatchObject({
			code: "not_found",
		});
		// The declined record would block the next tests' offers for its cooldown.
		await db.delete(socialShare).where(eq(socialShare.senderId, alice));
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
	});

	test("unfriending and blocking revoke pending shares; the source becoming unavailable hides the reason", async () => {
		const first = await pendingShare(alice, bob, "aaaa1111");
		await removeFriend(alice, bob);
		expect((await shareRow(first))?.status).toBe("revoked");
		expect((await listInbox(bob, null)).items).toHaveLength(0);
		await befriend(alice, bob);

		const second = await pendingShare(alice, bob, "aaaa1111");
		await blockUser(bob, alice);
		expect((await shareRow(second))?.status).toBe("revoked");
		await unblockUser(bob, alice);
		await befriend(alice, bob);

		const third = await pendingShare(alice, bob, "aaaa1111");
		const restriction = await db.transaction((tx) =>
			suspendSharing(tx, {
				userId: alice,
				until: null,
				reason: "test",
				noticeId: null,
				createdBy: "admin",
				now,
			}),
		);
		expect((await listInbox(bob, null)).items[0]?.subject).toMatchObject({
			kind: "share",
			state: "unavailable",
			book: { title: "Moby-Dick", cover: null },
		});
		await expect(respondToShare(bob, third, "accept")).rejects.toMatchObject({
			code: "unavailable",
		});
		await db.delete(socialRestriction).where(eq(socialRestriction.id, restriction.id));
		expect((await listInbox(bob, null)).items[0]?.subject).toMatchObject({ state: "pending" });
	});

	test("accepting copies exactly the right fields with a new id and the source's origin, and tells the sender", async () => {
		const [open] = await listSharesForBook(alice, "aaaa1111");
		if (!open) throw new Error("expected an open share");
		const acceptedAt = new Date(now.getTime() + 60_000);
		const { bookId } = await respondToShare(bob, open.shareId, "accept", acceptedAt);
		if (!bookId) throw new Error("expected a copy");
		expect(bookId).toMatch(/^[0-9a-f]{8}$/);
		expect(bookId).not.toBe("aaaa1111");

		const copy = await book(bob, bookId);
		expect(copy).toMatchObject({
			originUserId: alice,
			originBookId: "aaaa1111",
			title: "Moby-Dick",
			author: "Melville",
			content: "Call me Ishmael.",
			coverImage: "data:image/png;base64,AAAA",
			chapters: '[{"title":"Loomings","startWord":0}]',
			linkRanges: '[{"href":"https://x.test","startWord":0,"endWord":1}]',
			description: "A whale",
			language: "en",
			source: "gutenberg",
			catalogId: "gutenberg:2701",
			fileSize: 12,
			wordCount: 3,
			wordPosition: 0,
			sourceUrl: null,
			status: null,
			rating: null,
			review: null,
			tags: null,
			finishedAt: null,
			seriesId: null,
			hideFromProfile: false,
			deleted: false,
		});
		expect(copy?.addedAt?.getTime()).toBe(acceptedAt.getTime());
		expect(copy?.updatedAt.getTime()).toBe(acceptedAt.getTime());
		expect(copy?.metadataUpdatedAt?.getTime()).toBe(acceptedAt.getTime());
		expect(
			await db.select().from(syncHighlights).where(eq(syncHighlights.userId, bob)),
		).toHaveLength(0);
		expect(await db.select().from(syncBookCopy).where(eq(syncBookCopy.userId, bob))).toMatchObject([
			{ bookId, originUserId: alice, originBookId: "aaaa1111", via: "share" },
		]);
		expect(await shareRow(open.shareId)).toMatchObject({ status: "accepted", copyBookId: bookId });

		const senderInbox = await listInbox(alice, null);
		expect(senderInbox.items).toMatchObject([{ type: "share_accepted", actor: { userId: bob } }]);
		const recipientInbox = await listInbox(bob, null);
		expect(recipientInbox.items[0]?.subject).toMatchObject({ state: "accepted" });
		expect(recipientInbox.items[0]?.readAt).not.toBeNull();
		expect(await unreadCount(bob)).toBe(0);
	});

	test("a copy of a copy keeps the first origin, and an existing copy is linked instead of duplicated", async () => {
		const [bobCopy] = await booksOf(bob);
		if (!bobCopy) throw new Error("expected bob's copy");
		const toCarol = await pendingShare(bob, carol, bobCopy.bookId);
		const { bookId: carolBookId } = await respondToShare(carol, toCarol, "accept");
		expect(await book(carol, carolBookId ?? "")).toMatchObject({
			originUserId: alice,
			originBookId: "aaaa1111",
			content: "Call me Ishmael.",
		});

		// Bob shares back to Alice, who holds the original: nothing new is created.
		const back = await pendingShare(bob, alice, bobCopy.bookId);
		const linked = await respondToShare(alice, back, "accept");
		expect(linked.bookId).toBe("aaaa1111");
		expect(await booksOf(alice)).toHaveLength(4);

		// A second copy of the same origin for the same user links to the first.
		const copyInput = {
			sourceUserId: alice,
			sourceBookId: "aaaa1111",
			recipientId: dave,
			via: "share" as const,
		};
		// Two transactions race for the first copy: the unique index lets one in,
		// the other lands on its row instead of duplicating it.
		const [first, second] = await Promise.all([
			db.transaction((tx) => copyBookForUser(tx, copyInput)),
			db.transaction((tx) => copyBookForUser(tx, copyInput)),
		]);
		expect([first.created, second.created].filter(Boolean)).toHaveLength(1);
		expect(first.bookId).toBe(second.bookId);
		expect(await booksOf(dave)).toHaveLength(1);
		const third = await db.transaction((tx) => copyBookForUser(tx, copyInput));
		expect(third).toEqual({ bookId: first.bookId, created: false });
	});

	test("the daily cap counts share rows in Postgres", async () => {
		const sender = dave;
		await befriend(dave, carol);
		const [daveBook] = await booksOf(dave);
		if (!daveBook) throw new Error("expected dave's copy");
		const rows = Array.from({ length: 20 }, (_, i) => ({
			senderId: sender,
			recipientId: carol,
			bookId: `dead00${i.toString(16).padStart(2, "0")}`,
			originUserId: sender,
			originBookId: `dead00${i.toString(16).padStart(2, "0")}`,
			title: "filler",
			status: "revoked" as const,
			createdAt: new Date(now.getTime() - 60_000),
			resolvedAt: now,
		}));
		await db.insert(socialShare).values(rows);
		await expect(
			createShare(sender, { recipientId: carol, bookId: daveBook.bookId, confirmRights: true }),
		).rejects.toMatchObject({ code: "limit_reached" });
		await db
			.delete(socialShare)
			.where(and(eq(socialShare.senderId, sender), eq(socialShare.title, "filler")));
	});

	test("closed share records older than 90 days are purged when the sender shares again", async () => {
		const old = new Date(now.getTime() - 200 * DAY_MS);
		const [stale] = await db
			.insert(socialShare)
			.values([
				{
					senderId: alice,
					recipientId: bob,
					bookId: "aaaa2222",
					originUserId: alice,
					originBookId: "aaaa2222",
					title: "stale",
					status: "declined",
					createdAt: old,
					resolvedAt: new Date(old.getTime() + DAY_MS),
				},
				{
					senderId: alice,
					recipientId: bob,
					bookId: "aaaa2222",
					originUserId: alice,
					originBookId: "aaaa2222",
					title: "abandoned",
					status: "pending",
					createdAt: old,
				},
			])
			.returning({ id: socialShare.id });
		// Any share attempt runs the purge, even one that is then refused.
		await expect(
			createShare(alice, { recipientId: bob, bookId: "aaaa2222" }),
		).rejects.toMatchObject({ code: "not_shareable" });
		expect(await db.select().from(socialShare).where(eq(socialShare.title, "stale"))).toHaveLength(
			0,
		);
		expect(
			await db.select().from(socialShare).where(eq(socialShare.title, "abandoned")),
		).toHaveLength(0);
		expect(stale).toBeDefined();
	});

	test("a copy survives unfriending, blocking and the sender's account deletion", async () => {
		const [carolCopy] = await booksOf(carol);
		if (!carolCopy) throw new Error("expected carol's copy");
		await removeFriend(bob, carol);
		await blockUser(carol, bob);
		expect((await book(carol, carolCopy.bookId))?.deleted).toBe(false);
		await unblockUser(carol, bob);

		await deleteUserAccount(dave);
		const [bobCopy] = await booksOf(bob);
		expect(bobCopy?.deleted).toBe(false);
		expect(await db.select().from(user).where(eq(user.id, dave))).toHaveLength(0);
	});

	test("an in-app report of a received share needs the share; origin-scope takedown removes every copy but the origin", async () => {
		const [bobCopy] = await booksOf(bob);
		const [carolCopy] = await booksOf(carol);
		if (!bobCopy || !carolCopy) throw new Error("expected copies");
		const [acceptedShare] = await db
			.select()
			.from(socialShare)
			.where(
				and(
					eq(socialShare.senderId, alice),
					eq(socialShare.recipientId, bob),
					eq(socialShare.status, "accepted"),
				),
			);
		if (!acceptedShare) throw new Error("expected the accepted share");

		await expect(
			createNotice(carol, {
				targetType: "shared_book",
				targetUserId: alice,
				subjectId: acceptedShare.id,
				reason: "copyright",
				text: "I never received this, but I report it anyway.",
			}),
		).rejects.toMatchObject({ code: "not_found" });

		const { id } = await createNotice(bob, {
			targetType: "shared_book",
			targetUserId: alice,
			subjectId: acceptedShare.id,
			reason: "copyright",
			text: "This book is pirated.",
		});
		const [notice] = await db.select().from(socialNotice).where(eq(socialNotice.id, id));
		expect(notice).toMatchObject({
			targetRef: `${alice}:aaaa1111`,
			targetSnapshot: { title: "Moby-Dick", ownerHandle: `alice_${run}` },
		});

		// A fresh pending offer of the same origin is revoked by the takedown.
		await befriend(bob, carol);
		const pending = await pendingShare(bob, carol, bobCopy.bookId);

		await decideNotice(
			{ noticeId: id, adminId: "admin", action: "take_down_book", scope: "origin" },
			{ ban },
		);
		// The reported row (the origin itself here) is removed, so are both copies.
		expect((await book(alice, "aaaa1111"))?.deleted).toBe(true);
		expect(await book(bob, bobCopy.bookId)).toMatchObject({ deleted: true, content: null });
		expect(await book(carol, carolCopy.bookId)).toMatchObject({ deleted: true, content: null });
		expect(await isOriginTakenDown(alice, "aaaa1111")).toBe(true);
		expect((await shareRow(pending))?.status).toBe("revoked");
		expect([...(await takenDownBookIds(db, bob, [bobCopy.bookId]))]).toEqual([bobCopy.bookId]);

		const bobItems = (await listInbox(bob, null)).items;
		expect(bobItems.map((i) => i.type)).toContain("share_removed");
		expect(bobItems.find((i) => i.type === "share_removed")?.actor).toBeNull();
		expect((await listInbox(carol, null)).items.map((i) => i.type)).toContain("share_removed");
		expect((await listInbox(alice, null)).items.map((i) => i.type)).toContain(
			"statement_of_reasons",
		);
		expect((await listInbox(alice, null)).items.map((i) => i.type)).not.toContain("share_removed");

		// No further share of that origin, even from a copy that somehow survived.
		await db
			.update(syncBooks)
			.set({ deleted: false, content: "x" })
			.where(and(eq(syncBooks.userId, bob), eq(syncBooks.bookId, bobCopy.bookId)));
		await expect(
			createShare(bob, { recipientId: carol, bookId: bobCopy.bookId }),
		).rejects.toMatchObject({ code: "not_shareable" });
	});

	test("origin scope still finds the copies after the sender's account is gone", async () => {
		const [eve] = [`test-share-e-${run}`];
		await db.insert(user).values({ id: eve, name: "Eve", email: `${eve}@example.test` });
		await claimHandle(eve, `eve_${run}`, "eve");
		await befriend(eve, bob);
		await db.insert(syncBooks).values({
			userId: eve,
			bookId: "eeee1111",
			originUserId: eve,
			originBookId: "eeee1111",
			title: "Eve's book",
			content: "text",
			updatedAt: now,
		});
		const shareId = await pendingShare(eve, bob, "eeee1111");
		const { bookId } = await respondToShare(bob, shareId, "accept");
		const { id } = await createNotice(bob, {
			targetType: "shared_book",
			targetUserId: eve,
			subjectId: shareId,
			reason: "copyright",
			text: "Eve shared a pirated book.",
		});
		// The share record is the notifier's; deleting Eve removes it, but the copy's origin columns remain.
		await deleteUserAccount(eve);
		await decideNotice(
			{ noticeId: id, adminId: "admin", action: "take_down_book", scope: "origin" },
			{ ban },
		);
		expect(await book(bob, bookId ?? "")).toMatchObject({ deleted: true, content: null });
		expect(await isOriginTakenDown(eve, "eeee1111")).toBe(true);
	});

	test("copy scope removes only the reported row", async () => {
		await db.insert(syncBooks).values([
			{
				userId: alice,
				bookId: "bbbb1111",
				originUserId: alice,
				originBookId: "bbbb1111",
				title: "Second",
				content: "two",
				updatedAt: now,
			},
		]);
		const shareId = await pendingShare(alice, bob, "bbbb1111");
		const { bookId } = await respondToShare(bob, shareId, "accept");
		const { id } = await createNotice(bob, {
			targetType: "shared_book",
			targetUserId: alice,
			subjectId: shareId,
			reason: "harassment",
			text: "The text is abusive.",
		});
		await decideNotice(
			{ noticeId: id, adminId: "admin", action: "take_down_book", scope: "copy" },
			{ ban },
		);
		expect((await book(alice, "bbbb1111"))?.deleted).toBe(true);
		expect((await book(bob, bookId ?? ""))?.deleted).toBe(false);
		expect(await isOriginTakenDown(alice, "bbbb1111")).toBe(false);
	});
});
