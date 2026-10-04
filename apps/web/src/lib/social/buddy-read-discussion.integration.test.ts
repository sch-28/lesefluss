// @vitest-environment node
//
// Buddy-read discussion against a real Postgres database. Skipped when DATABASE_URL is unset.
// The tests build on each other's state in file order; run the file, not single tests.
import { randomUUID } from "node:crypto";
import { PostCommentBodySchema } from "@lesefluss/core";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import {
	buddyRead,
	buddyReadComment,
	buddyReadReaction,
	buddyReadSharedHighlight,
	socialBlock,
	socialHandle,
	socialNotice,
	socialNotification,
	socialRestriction,
	syncBookCopy,
	syncBooks,
	syncHighlights,
	syncReadingSessions,
} from "~/db/schema";
import { deleteUserAccount } from "~/lib/account-deletion";
import { decideNotice } from "~/lib/moderation/decide";
import { createNotice } from "~/lib/moderation/notices";
import { suspendSharing, suspensionUntil } from "~/lib/moderation/restrictions";
import {
	addReaction,
	deleteComment,
	editComment,
	getDiscussion,
	postComment,
	removeReaction,
	replyToComment,
	shareHighlight,
	unshareHighlight,
	updateDiscussionSettings,
} from "./buddy-read-discussion";
import { createBuddyRead, leaveBuddyRead, respondToBuddyReadInvite } from "./buddy-reads";
import { isVisibleToViewer, UNLOCK_LOOKAHEAD_WORDS } from "./discussion-gate";
import { blockUser, createFriendship } from "./friends";
import { claimHandle } from "./handle";
import { listInbox } from "./inbox";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));

const hasDb = Boolean(process.env.DATABASE_URL);
const ban = { ban: vi.fn(async () => {}), unban: vi.fn(async () => {}) };

describe.skipIf(!hasDb)("buddy-read discussion (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const names = ["alice", "bob", "carol", "dave", "erin"] as const;
	const id = Object.fromEntries(names.map((n) => [n, `test-bd-${n}-${run}`])) as Record<
		(typeof names)[number],
		string
	>;
	const all = Object.values(id);
	const { alice, bob, carol, dave, erin } = id;
	const now = new Date();
	let readId = "";
	const bookOf: Record<string, string> = {};

	async function setPosition(userId: string, wordPosition: number) {
		await db
			.update(syncBooks)
			.set({ wordPosition })
			.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookOf[userId] ?? "")));
	}
	const range = (startWord: number, endWord: number) => ({
		kind: "range" as const,
		startWord,
		startCharInWord: 0,
		endWord,
		endCharInWord: 0,
	});
	async function bodiesFor(viewer: string) {
		const page = await getDiscussion(viewer, readId);
		return page.items.map((i) => (i.kind === "comment" ? (i.body ?? "(removed)") : `hl:${i.text}`));
	}
	async function inboxTypes(userId: string) {
		return (await listInbox(userId, null)).items.map((i) => i.type);
	}
	async function joinByInvite(userId: string) {
		const [item] = (await listInbox(userId, null)).items.filter(
			(i) => i.type === "buddy_read_invite",
		);
		const inviteId = item?.subject?.kind === "buddy_read_invite" ? item.subject.inviteId : "";
		const { bookId } = await respondToBuddyReadInvite(userId, inviteId, "accept");
		bookOf[userId] = bookId ?? "";
	}
	async function addHighlight(
		userId: string,
		highlightId: string,
		start: number,
		end: number,
		text: string | null,
		note: string | null = null,
	) {
		await db.insert(syncHighlights).values({
			userId,
			highlightId,
			bookId: bookOf[userId] ?? "",
			startWord: start,
			endWord: end,
			text,
			note,
			createdAt: now,
			updatedAt: now,
		});
	}

	beforeAll(async () => {
		process.env.BETTER_AUTH_SECRET ??= "test-secret";
		process.env.BETTER_AUTH_URL ??= "https://lesefluss.test";
		await db
			.insert(user)
			.values(all.map((u) => ({ id: u, name: `Name ${u}`, email: `${u}@example.test` })));
		for (const n of names) await claimHandle(id[n], `${n}_${run}`, n);
		for (const n of ["bob", "carol", "erin"] as const) {
			await db.transaction((tx) => createFriendship(tx, alice, id[n], now));
		}
		bookOf[alice] = "dddd0001";
		await db.insert(syncBooks).values({
			userId: alice,
			bookId: "dddd0001",
			originUserId: alice,
			originBookId: "dddd0001",
			title: "Discussed",
			content: "text",
			wordCount: 1000,
			wordPosition: 0,
			chapters: JSON.stringify([
				{ title: "One", startWord: 0 },
				{ title: "Two", startWord: 500 },
			]),
			updatedAt: now,
		});
		({ buddyReadId: readId } = await createBuddyRead(alice, {
			bookId: "dddd0001",
			inviteeIds: [bob, carol, erin],
		}));
		await joinByInvite(bob);
		await joinByInvite(carol);
		await joinByInvite(erin);
	});

	afterAll(async () => {
		await db.delete(buddyRead).where(inArray(buddyRead.originUserId, all));
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		await db.delete(socialNotice).where(inArray(socialNotice.targetUserId, all));
		await db.delete(syncHighlights).where(inArray(syncHighlights.userId, all));
		await db.delete(syncReadingSessions).where(inArray(syncReadingSessions.userId, all));
		await db.delete(syncBookCopy).where(inArray(syncBookCopy.userId, all));
		await db.delete(syncBooks).where(inArray(syncBooks.userId, all));
		await db.delete(user).where(inArray(user.id, all));
		const rows = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = rows.map((r) => r.handle).filter((h) => h.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	test("a comment body is trimmed, keeps line breaks, and must be 1 to 2,000 characters", () => {
		const parse = (body: string) =>
			PostCommentBodySchema.safeParse({ buddyReadId: randomUUID(), anchor: range(0, 0), body });
		expect(parse("   ").success).toBe(false);
		expect(parse("x".repeat(2001)).success).toBe(false);
		const ok = parse("  line one\r\nline two  ");
		expect(ok.success && ok.data.body).toBe("line one\nline two");
	});

	test("anchors must lie in the book, and chapter anchors on a chapter start", async () => {
		const post = (anchor: Parameters<typeof postComment>[1]["anchor"]) =>
			postComment(alice, { buddyReadId: readId, anchor, body: "x" });
		await expect(post(range(10, 1000))).rejects.toMatchObject({ code: "invalid_anchor" });
		await expect(post(range(20, 10))).rejects.toMatchObject({ code: "invalid_anchor" });
		await expect(post({ kind: "chapter", startWord: 10 })).rejects.toMatchObject({
			code: "invalid_anchor",
		});
		await expect(
			postComment(dave, { buddyReadId: readId, anchor: range(0, 0), body: "x" }),
		).rejects.toMatchObject({
			code: "not_found",
		});
		expect((await post({ kind: "chapter", startWord: 500 })).commentId).toBeTruthy();
		expect((await post(range(300, 400))).commentId).toBeTruthy();
	});

	test("an item unlocks once its start is within the lookahead of the reader's position", async () => {
		expect(await bodiesFor(bob)).toEqual([]);
		expect(await getDiscussion(bob, readId)).toMatchObject({
			hiddenAhead: 2,
			nextUnlockWord: 300 - UNLOCK_LOOKAHEAD_WORDS,
		});
		await setPosition(bob, 300 - UNLOCK_LOOKAHEAD_WORDS - 1);
		expect(await bodiesFor(bob)).toEqual([]);
		await setPosition(bob, 300 - UNLOCK_LOOKAHEAD_WORDS);
		expect(await bodiesFor(bob)).toEqual(["x"]);
		await setPosition(bob, 500 - UNLOCK_LOOKAHEAD_WORDS - 1);
		expect(await getDiscussion(bob, readId)).toMatchObject({
			hiddenAhead: 1,
			nextUnlockWord: 500 - UNLOCK_LOOKAHEAD_WORDS,
		});
		await setPosition(bob, 500 - UNLOCK_LOOKAHEAD_WORDS);
		expect(await bodiesFor(bob)).toEqual(["x", "x"]);
		expect(await getDiscussion(bob, readId)).toMatchObject({
			hiddenAhead: 0,
			nextUnlockWord: null,
		});
	});

	test("unlocked items stay unlocked after a jump back or a session wipe", async () => {
		await setPosition(bob, 5);
		expect(await bodiesFor(bob)).toHaveLength(2);
		await db.insert(syncReadingSessions).values({
			userId: carol,
			sessionId: `s-${run}`,
			bookId: bookOf[carol] ?? "",
			mode: "scroll",
			startedAt: now,
			endedAt: now,
			durationMs: 1000,
			wordsRead: 60,
			startWord: 0,
			endWord: 60,
			updatedAt: now,
		});
		expect((await getDiscussion(carol, readId)).furthestWord).toBe(60);
		await db.delete(syncReadingSessions).where(eq(syncReadingSessions.userId, carol));
		expect(await bodiesFor(carol)).toEqual(["x"]);
	});

	test("own items are always visible; show-everything lifts the gate and can be switched off", async () => {
		await postComment(carol, { buddyReadId: readId, anchor: range(900, 950), body: "late" });
		expect(await bodiesFor(carol)).toContain("late");
		expect(await bodiesFor(bob)).not.toContain("late");
		await updateDiscussionSettings(bob, { buddyReadId: readId, showEverything: true });
		expect(await bodiesFor(bob)).toContain("late");
		await updateDiscussionSettings(bob, { buddyReadId: readId, showEverything: false });
		expect(await bodiesFor(bob)).not.toContain("late");
		expect(
			await isVisibleToViewer(db, readId, bob, {
				authorId: carol,
				startWord: 900,
			}),
		).toBe(false);
		expect(
			await isVisibleToViewer(db, readId, carol, {
				authorId: carol,
				startWord: 900,
			}),
		).toBe(true);
	});

	test("replies, edits and deletes; reply notices collapse per comment and skip the author's own", async () => {
		const page = await getDiscussion(alice, readId);
		const passage = page.items.find((i) => i.kind === "comment" && i.startWord === 300);
		const parentId = passage?.id ?? "";
		await replyToComment(alice, { parentId, body: "self" });
		expect(await inboxTypes(alice)).not.toContain("buddy_read_reply");
		await replyToComment(bob, { parentId, body: "bob says" });
		await replyToComment(carol, { parentId, body: "carol says" });
		const replies = (await listInbox(alice, null)).items.filter(
			(i) => i.type === "buddy_read_reply",
		);
		expect(replies).toHaveLength(1);
		expect(replies[0]?.actor?.userId).toBe(carol);
		expect(replies[0]?.payload?.text).toBe("and 1 other");
		expect(replies[0]?.subject).toMatchObject({
			kind: "buddy_read_discussion",
			buddyReadId: readId,
		});

		const late = (await getDiscussion(carol, readId)).items.find(
			(i) => i.kind === "comment" && i.startWord === 900,
		);
		await expect(
			replyToComment(bob, { parentId: late?.id ?? "", body: "peek" }),
		).rejects.toMatchObject({
			code: "not_found",
		});

		await editComment(alice, { commentId: parentId, body: "x, edited" });
		await expect(editComment(bob, { commentId: parentId, body: "hijack" })).rejects.toMatchObject({
			code: "not_found",
		});
		const edited = (await getDiscussion(bob, readId)).items.find((i) => i.id === parentId);
		expect(edited?.kind === "comment" && edited.editedAt).toBeTruthy();

		await deleteComment(alice, parentId);
		const removed = (await getDiscussion(bob, readId)).items.find((i) => i.id === parentId);
		expect(removed).toMatchObject({ kind: "comment", removed: true, body: null, author: null });
		expect(removed?.kind === "comment" && removed.replies.map((r) => r.body)).toEqual([
			"self",
			"bob says",
			"carol says",
		]);
	});

	test("reactions: one per emoji and person, notified collapsed, never on hidden items", async () => {
		const chapter = (await getDiscussion(bob, readId)).items.find(
			(i) => i.kind === "comment" && i.anchorKind === "chapter",
		);
		const commentId = chapter?.id ?? "";
		await addReaction(bob, { commentId, emoji: "👍" });
		await addReaction(bob, { commentId, emoji: "👍" });
		await setPosition(carol, 500);
		await addReaction(carol, { commentId, emoji: "👍" });
		const view = (await getDiscussion(alice, readId)).items.find((i) => i.id === commentId);
		expect(view?.reactions).toEqual([{ emoji: "👍", count: 2, mine: false }]);
		const notes = (await listInbox(alice, null)).items.filter(
			(i) => i.type === "buddy_read_reaction",
		);
		expect(notes).toHaveLength(1);
		await removeReaction(carol, { commentId, emoji: "👍" });
		expect(
			(await getDiscussion(alice, readId)).items.find((i) => i.id === commentId)?.reactions,
		).toEqual([{ emoji: "👍", count: 1, mine: false }]);
		const late = (await getDiscussion(carol, readId)).items.find(
			(i) => i.kind === "comment" && i.startWord === 900,
		);
		await expect(
			addReaction(bob, { commentId: late?.id ?? "", emoji: "🔥" }),
		).rejects.toMatchObject({ code: "not_found" });
	});

	test("sharing a highlight: preview data, null text, unsynced, unshare removes reactions", async () => {
		await addHighlight(bob, "hl-bob-1", 10, 12, "a passage", "my note");
		await addHighlight(bob, "hl-bob-2", 14, 15, null);
		await expect(
			shareHighlight(bob, { buddyReadId: readId, highlightId: "hl-bob-2" }),
		).rejects.toMatchObject({
			code: "highlight_no_text",
		});
		await expect(
			shareHighlight(bob, { buddyReadId: readId, highlightId: "hl-missing" }),
		).rejects.toMatchObject({
			code: "highlight_not_synced",
		});
		const { sharedHighlightId } = await shareHighlight(bob, {
			buddyReadId: readId,
			highlightId: "hl-bob-1",
		});
		await setPosition(alice, 600);
		const shared = (await getDiscussion(alice, readId)).items.find(
			(i) => i.id === sharedHighlightId,
		);
		expect(shared).toMatchObject({ kind: "highlight", text: "a passage", note: "my note" });

		await db
			.update(syncHighlights)
			.set({ note: "revised" })
			.where(and(eq(syncHighlights.userId, bob), eq(syncHighlights.highlightId, "hl-bob-1")));
		expect(
			(await getDiscussion(alice, readId)).items.find((i) => i.id === sharedHighlightId),
		).toMatchObject({
			note: "revised",
		});

		await addReaction(alice, { sharedHighlightId, emoji: "❤️" });
		await unshareHighlight(bob, sharedHighlightId);
		expect((await getDiscussion(alice, readId)).items.some((i) => i.id === sharedHighlightId)).toBe(
			false,
		);
		expect(
			await db
				.select()
				.from(buddyReadReaction)
				.where(eq(buddyReadReaction.sharedHighlightId, sharedHighlightId)),
		).toHaveLength(0);
	});

	test("share-all covers new highlights, blocks single unshares, and switching it off withdraws them", async () => {
		await addHighlight(bob, "hl-bob-3", 20, 22, "shared by default");
		await updateDiscussionSettings(bob, { buddyReadId: readId, shareAllHighlights: true });
		const all1 = await bodiesFor(alice);
		expect(all1).toContain("hl:shared by default");
		expect(all1).toContain("hl:a passage");
		const implicit = (await getDiscussion(alice, readId)).items.find(
			(i) => i.kind === "highlight" && i.text === "shared by default",
		);
		await expect(unshareHighlight(bob, implicit?.id ?? "")).rejects.toMatchObject({
			code: "share_all_on",
		});
		await db
			.update(syncHighlights)
			.set({ deleted: true })
			.where(and(eq(syncHighlights.userId, bob), eq(syncHighlights.highlightId, "hl-bob-1")));
		expect(await bodiesFor(alice)).not.toContain("hl:a passage");
		await updateDiscussionSettings(bob, { buddyReadId: readId, shareAllHighlights: false });
		expect((await bodiesFor(alice)).filter((b) => b.startsWith("hl:"))).toEqual([]);
	});

	test("a 30-day sharing suspension refuses sharing highlights until it runs out", async () => {
		const DAY_MS = 86_400_000;
		const day29 = new Date(now.getTime() + 29 * DAY_MS);
		const day31 = new Date(now.getTime() + 31 * DAY_MS);
		await addHighlight(carol, "hl-carol-s", 30, 31, "while suspended");
		await db.transaction((tx) =>
			suspendSharing(tx, {
				userId: carol,
				until: suspensionUntil("30d", now),
				reason: "test",
				noticeId: null,
				createdBy: "admin",
				now,
			}),
		);
		try {
			const single = (at: Date) =>
				shareHighlight(carol, { buddyReadId: readId, highlightId: "hl-carol-s" }, at);
			const shareAll = (at: Date) =>
				updateDiscussionSettings(carol, { buddyReadId: readId, shareAllHighlights: true }, at);
			await expect(single(day29)).rejects.toMatchObject({ code: "suspended" });
			await expect(shareAll(day29)).rejects.toMatchObject({ code: "suspended" });
			// Only switching share-all on is gated; switching it off stays possible.
			await updateDiscussionSettings(
				carol,
				{ buddyReadId: readId, shareAllHighlights: false },
				day29,
			);

			const { sharedHighlightId } = await single(day31);
			await shareAll(day31);
			await updateDiscussionSettings(carol, { buddyReadId: readId, shareAllHighlights: false });
			await unshareHighlight(carol, sharedHighlightId);
		} finally {
			await db.delete(socialRestriction).where(eq(socialRestriction.userId, carol));
		}
	});

	test("a block hides both people from each other everywhere in the discussion", async () => {
		const { sharedHighlightId } = await shareHighlight(bob, {
			buddyReadId: readId,
			highlightId: "hl-bob-3",
		});
		await setPosition(carol, 600);
		expect(await bodiesFor(carol)).toContain("hl:shared by default");
		const bobComment = await postComment(bob, {
			buddyReadId: readId,
			anchor: range(25, 26),
			body: "from bob",
		});
		await blockUser(carol, bob);
		const carolView = await bodiesFor(carol);
		expect(carolView).not.toContain("from bob");
		expect(carolView).not.toContain("hl:shared by default");
		expect(carolView).not.toContain("bob says");
		expect(await bodiesFor(bob)).not.toContain("carol says");
		await expect(addReaction(carol, { sharedHighlightId, emoji: "👍" })).rejects.toMatchObject({
			code: "not_found",
		});
		await expect(
			replyToComment(carol, { parentId: bobComment.commentId, body: "hi" }),
		).rejects.toMatchObject({
			code: "not_found",
		});
		// Hidden people do not count as hidden items either.
		await setPosition(carol, 0);
		expect((await getDiscussion(carol, readId)).hiddenAhead).toBe(0);
		await setPosition(carol, 600);
		await db.delete(socialBlock).where(eq(socialBlock.blockerId, carol));
	});

	test("a banned author's items take no replies or reactions; notice counts leave out hidden people", async () => {
		const { commentId } = await postComment(erin, {
			buddyReadId: readId,
			anchor: range(0, 0),
			body: "erin early",
		});
		const noticeFor = async (type: "buddy_read_reaction" | "buddy_read_reply") => {
			const [note] = await db
				.select()
				.from(socialNotification)
				.where(
					and(
						eq(socialNotification.recipientId, erin),
						eq(socialNotification.type, type),
						eq(socialNotification.subjectId, commentId),
					),
				);
			return note;
		};
		await addReaction(bob, { commentId, emoji: "❤️" });
		await replyToComment(bob, { parentId: commentId, body: "bob replies" });
		await db.insert(socialBlock).values({ blockerId: erin, blockedId: bob });
		await addReaction(alice, { commentId, emoji: "🔥" });
		expect(await noticeFor("buddy_read_reaction")).toMatchObject({ actorId: alice, payload: null });
		await replyToComment(alice, { parentId: commentId, body: "alice replies" });
		expect(await noticeFor("buddy_read_reply")).toMatchObject({ actorId: alice, payload: null });
		await db.delete(socialBlock).where(eq(socialBlock.blockerId, erin));

		await db.update(user).set({ banned: true }).where(eq(user.id, bob));
		await addReaction(carol, { commentId, emoji: "😂" });
		expect(await noticeFor("buddy_read_reaction")).toMatchObject({
			actorId: carol,
			payload: { text: "and 1 other" },
		});
		await db.update(user).set({ banned: false }).where(eq(user.id, bob));

		await db.update(user).set({ banned: true }).where(eq(user.id, erin));
		await expect(addReaction(alice, { commentId, emoji: "😮" })).rejects.toMatchObject({
			code: "not_found",
		});
		await expect(replyToComment(alice, { parentId: commentId, body: "hi" })).rejects.toMatchObject({
			code: "not_found",
		});
		const anchor = { authorId: erin, startWord: 0 };
		expect(await isVisibleToViewer(db, readId, alice, anchor)).toBe(false);
		await db.update(user).set({ banned: false }).where(eq(user.id, erin));
		expect(await isVisibleToViewer(db, readId, alice, anchor)).toBe(true);
	});

	test("members need not be friends; a leaver's comments stay and their highlights go", async () => {
		// bob and erin were never friends.
		await setPosition(erin, 600);
		await addHighlight(erin, "hl-erin", 30, 31, "erin's passage");
		await shareHighlight(erin, { buddyReadId: readId, highlightId: "hl-erin" });
		await postComment(erin, { buddyReadId: readId, anchor: range(5, 6), body: "erin was here" });
		const erinComment = (await getDiscussion(bob, readId)).items.find(
			(i) => i.kind === "comment" && i.body === "erin was here",
		);
		await addReaction(bob, { commentId: erinComment?.id ?? "", emoji: "😂" });
		expect(await bodiesFor(bob)).toContain("hl:erin's passage");
		await leaveBuddyRead(erin, readId);
		const after = await bodiesFor(bob);
		expect(after).toContain("erin was here");
		expect(after).not.toContain("hl:erin's passage");
		await expect(getDiscussion(erin, readId)).rejects.toMatchObject({ code: "not_found" });
		await expect(
			postComment(erin, { buddyReadId: readId, anchor: range(1, 1), body: "x" }),
		).rejects.toMatchObject({
			code: "not_found",
		});
		const json = JSON.stringify(await getDiscussion(bob, readId));
		expect(json).not.toContain("@example.test");
	});

	test("reports keep the text as reported; takedowns remove the comment or the share", async () => {
		const target = await postComment(bob, {
			buddyReadId: readId,
			anchor: range(2, 3),
			body: "rude words",
		});
		await expect(
			createNotice(dave, {
				targetType: "buddy_read_comment",
				targetUserId: bob,
				subjectId: target.commentId,
				reason: "harassment",
				text: "Not a member, should not work.",
			}),
		).rejects.toMatchObject({ code: "not_found" });
		const { id: noticeId } = await createNotice(alice, {
			targetType: "buddy_read_comment",
			targetUserId: bob,
			subjectId: target.commentId,
			reason: "harassment",
			text: "This comment insults me.",
		});
		await editComment(bob, { commentId: target.commentId, body: "nice words" });
		const [notice] = await db.select().from(socialNotice).where(eq(socialNotice.id, noticeId));
		expect(notice?.targetSnapshot).toMatchObject({ body: "rude words" });
		await decideNotice({ noticeId, adminId: "admin", action: "remove_comment" }, { ban });
		expect(
			await db.select().from(buddyReadComment).where(eq(buddyReadComment.id, target.commentId)),
		).toHaveLength(0);
		expect(await inboxTypes(bob)).toContain("statement_of_reasons");

		const { sharedHighlightId } = await shareHighlight(bob, {
			buddyReadId: readId,
			highlightId: "hl-bob-3",
		});
		const { id: hlNotice } = await createNotice(alice, {
			targetType: "buddy_read_highlight",
			targetUserId: bob,
			subjectId: sharedHighlightId,
			reason: "other",
			text: "This highlight note is abusive.",
		});
		await decideNotice(
			{ noticeId: hlNotice, adminId: "admin", action: "remove_highlight_share" },
			{ ban },
		);
		expect(await bodiesFor(alice)).not.toContain("hl:shared by default");
		const [own] = await db
			.select()
			.from(syncHighlights)
			.where(and(eq(syncHighlights.userId, bob), eq(syncHighlights.highlightId, "hl-bob-3")));
		expect(own?.deleted).toBe(false);
		await expect(
			shareHighlight(bob, { buddyReadId: readId, highlightId: "hl-bob-3" }),
		).rejects.toMatchObject({
			code: "highlight_removed",
		});
	});

	test("account deletion removes reactions and shares, and anonymises comments with replies", async () => {
		const lone = await postComment(bob, { buddyReadId: readId, anchor: range(7, 8), body: "lone" });
		const threaded = await postComment(bob, {
			buddyReadId: readId,
			anchor: range(9, 9),
			body: "threaded",
		});
		await replyToComment(alice, { parentId: threaded.commentId, body: "an answer" });
		await deleteUserAccount(bob);
		expect(
			await db.select().from(buddyReadComment).where(eq(buddyReadComment.id, lone.commentId)),
		).toHaveLength(0);
		const [placeholder] = await db
			.select()
			.from(buddyReadComment)
			.where(eq(buddyReadComment.id, threaded.commentId));
		expect(placeholder).toMatchObject({ body: null, authorId: null });
		expect(
			await db.select().from(buddyReadReaction).where(eq(buddyReadReaction.userId, bob)),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(buddyReadSharedHighlight)
				.where(eq(buddyReadSharedHighlight.userId, bob)),
		).toHaveLength(0);
		expect(await bodiesFor(alice)).toContain("(removed)");
	});

	test("deleting a buddy read deletes its whole discussion", async () => {
		await db.delete(buddyRead).where(eq(buddyRead.id, readId));
		expect(
			await db.select().from(buddyReadComment).where(eq(buddyReadComment.buddyReadId, readId)),
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(buddyReadSharedHighlight)
				.where(eq(buddyReadSharedHighlight.buddyReadId, readId)),
		).toHaveLength(0);
		expect(
			await db.select().from(buddyReadReaction).where(eq(buddyReadReaction.buddyReadId, readId)),
		).toHaveLength(0);
	});
});
