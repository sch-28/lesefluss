// @vitest-environment node
import { randomUUID } from "node:crypto";
import type { SyncBook } from "@lesefluss/core";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import { socialFeedEvent, socialHandle, syncBooks } from "~/db/schema";
import { deleteUserAccount } from "~/lib/account-deletion";
import { upsertSyncBooks } from "~/lib/sync-book-upsert";
import { deleteFeedEvent, listFeed } from "./feed";
import { blockUser, createFriendship, removeFriend } from "./friends";
import { claimHandle } from "./handle";
import { updateOwnProfile } from "./profile";

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY_MS = 86_400_000;

describe.skipIf(!hasDb)("activity feed (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const names = ["ann", "ben", "cat", "dan"] as const;
	const id = Object.fromEntries(names.map((n) => [n, `test-feed-${n}-${run}`])) as Record<
		(typeof names)[number],
		string
	>;
	const all = Object.values(id);
	const { ann, ben, cat, dan } = id;
	const now = new Date();

	async function addBook(
		userId: string,
		bookId: string,
		patch: Partial<typeof syncBooks.$inferInsert> = {},
	) {
		await db.insert(syncBooks).values({
			userId,
			bookId,
			title: `Book ${bookId}`,
			content: "text",
			wordCount: 1000,
			wordPosition: 0,
			updatedAt: now,
			...patch,
			originUserId: userId,
			originBookId: bookId,
		});
	}

	type Patch = {
		wordPosition?: number;
		finishedAt?: Date | null;
		rating?: number;
		deleted?: boolean;
	};

	function payloadBook(
		bookId: string,
		stored: typeof syncBooks.$inferSelect | undefined,
		patch: Patch,
		at: Date,
	): SyncBook {
		const revision = Math.max(stored?.updatedAt.getTime() ?? 0, at.getTime()) + 1;
		const finishedAt =
			patch.finishedAt !== undefined ? patch.finishedAt : (stored?.finishedAt ?? null);
		return {
			bookId,
			title: stored?.title ?? `Book ${bookId}`,
			author: stored?.author ?? null,
			fileSize: null,
			wordCount: stored?.wordCount ?? 1000,
			wordPosition: patch.wordPosition ?? stored?.wordPosition ?? 0,
			content: stored ? undefined : "text",
			source: stored?.source ?? null,
			seriesId: stored?.seriesId ?? null,
			finishedAt: finishedAt ? finishedAt.getTime() : null,
			rating: patch.rating ?? stored?.rating ?? null,
			metadataUpdatedAt: revision,
			chapterStatus: "fetched",
			deleted: patch.deleted ?? stored?.deleted ?? false,
			updatedAt: revision,
		};
	}

	/** A sync push through the same upsert, RETURNING and recording the route uses. */
	async function push(userId: string, bookId: string, patch: Patch, at = now) {
		const [stored] = await db
			.select()
			.from(syncBooks)
			.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookId)));
		await db.transaction((tx) =>
			upsertSyncBooks(tx, userId, [payloadBook(bookId, stored, patch, at)], new Map(), at),
		);
	}

	async function eventsOf(userId: string) {
		return db
			.select({ bookId: socialFeedEvent.bookId, type: socialFeedEvent.type })
			.from(socialFeedEvent)
			.where(eq(socialFeedEvent.actorId, userId));
	}

	async function feedTitles(viewer: string) {
		return (await listFeed(viewer, { now })).items.map(
			(i) =>
				`${i.actor.userId === viewer ? "me" : i.actor.handle.split("_")[0]}:${i.type}:${i.book.title}`,
		);
	}

	beforeAll(async () => {
		await db
			.insert(user)
			.values(all.map((u) => ({ id: u, name: `Name ${u}`, email: `${u}@example.test` })));
		for (const n of names) await claimHandle(id[n], `${n}_${run}`, n);
		for (const n of ["ben", "cat"] as const) {
			await db.transaction((tx) => createFriendship(tx, ann, id[n], now));
		}
		await updateOwnProfile(ben, { visibility: "friends" });
	});

	beforeEach(async () => {
		await db.delete(socialFeedEvent).where(inArray(socialFeedEvent.actorId, all));
		await db.delete(syncBooks).where(inArray(syncBooks.userId, all));
	});

	afterAll(async () => {
		await db.delete(syncBooks).where(inArray(syncBooks.userId, all));
		await db.delete(user).where(inArray(user.id, all));
		const rows = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = rows.map((r) => r.handle).filter((h) => h.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	test("starting and finishing record events that friends see; duplicates never appear", async () => {
		await addBook(ben, "bbbb0001");
		await push(ben, "bbbb0001", { wordPosition: 100 });
		await push(ben, "bbbb0001", { wordPosition: 990, finishedAt: now, rating: 8 });
		await push(ben, "bbbb0001", { wordPosition: 0 });
		await push(ben, "bbbb0001", { wordPosition: 200 });
		await push(ben, "bbbb0001", { wordPosition: 995 });
		expect((await eventsOf(ben)).map((e) => e.type).sort()).toEqual(["finished", "started"]);

		const page = await listFeed(ann, { now });
		expect(page.items.map((i) => i.type).sort()).toEqual(["finished", "started"]);
		const finished = page.items.find((i) => i.type === "finished");
		expect(finished).toMatchObject({ isOwn: false, book: { title: "Book bbbb0001", rating: 8 } });
		expect(finished?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(page.items.find((i) => i.type === "started")?.book.rating).toBeNull();
		const json = JSON.stringify(page);
		for (const leak of ["@example.test", "wordPosition", "review", "text"]) {
			expect(json).not.toContain(leak);
		}
	});

	test("nothing is recorded for new rows, old finishes, articles, serial chapters or tombstones", async () => {
		// First sync of a book the server has never seen, already read and finished.
		await push(ben, "bbbb0007", { wordPosition: 1000, finishedAt: now });
		expect(await eventsOf(ben)).toEqual([]);

		await addBook(ben, "bbbb0002", {
			wordPosition: 1000,
			finishedAt: new Date(now.getTime() - 30 * DAY_MS),
		});
		await push(ben, "bbbb0002", { finishedAt: new Date(now.getTime() - 30 * DAY_MS) });
		await addBook(ben, "bbbb0003", { wordPosition: 400 });
		await push(ben, "bbbb0003", {
			wordPosition: 999,
			finishedAt: new Date(now.getTime() - 10 * DAY_MS),
		});
		await addBook(ben, "bbbb0004", { source: "url" });
		await push(ben, "bbbb0004", { wordPosition: 500 });
		await addBook(ben, "bbbb0005", { seriesId: "s1" });
		await push(ben, "bbbb0005", { wordPosition: 500 });
		await addBook(ben, "bbbb0006");
		await push(ben, "bbbb0006", { wordPosition: 500, deleted: true });
		expect(await eventsOf(ben)).toEqual([]);
	});

	test("recording follows the actor's settings at that moment", async () => {
		await addBook(cat, "cccc0001");
		await push(cat, "cccc0001", { wordPosition: 100 });
		expect(await eventsOf(cat)).toEqual([]);

		await updateOwnProfile(ben, { showCurrentlyReading: false });
		await addBook(ben, "bbbb0010");
		await push(ben, "bbbb0010", { wordPosition: 100 });
		expect(await eventsOf(ben)).toEqual([]);
		await updateOwnProfile(ben, { showCurrentlyReading: true, feedEnabled: false });
		await push(ben, "bbbb0010", { wordPosition: 990, finishedAt: now });
		expect(await eventsOf(ben)).toEqual([]);
		await updateOwnProfile(ben, { feedEnabled: true });
	});

	test("read-time filters: hidden book, section off, private, tombstone, and the viewer's own events", async () => {
		await addBook(ben, "bbbb0020");
		await addBook(ben, "bbbb0021");
		await push(ben, "bbbb0020", { wordPosition: 100 });
		await push(ben, "bbbb0021", { wordPosition: 100 });
		expect(await feedTitles(ann)).toHaveLength(2);

		await db
			.update(syncBooks)
			.set({ hideFromProfile: true })
			.where(and(eq(syncBooks.userId, ben), eq(syncBooks.bookId, "bbbb0020")));
		expect(await feedTitles(ann)).toEqual(["ben:started:Book bbbb0021"]);
		await db
			.update(syncBooks)
			.set({ deleted: true })
			.where(and(eq(syncBooks.userId, ben), eq(syncBooks.bookId, "bbbb0021")));
		expect(await feedTitles(ann)).toEqual([]);
		await db
			.update(syncBooks)
			.set({ hideFromProfile: false, deleted: false })
			.where(eq(syncBooks.userId, ben));

		await updateOwnProfile(ben, { showCurrentlyReading: false });
		expect(await feedTitles(ann)).toEqual([]);
		// The owner still sees their own events, labelled as theirs.
		expect((await listFeed(ben, { now })).items.every((i) => i.isOwn)).toBe(true);
		expect((await listFeed(ben, { now })).items).toHaveLength(2);
		await updateOwnProfile(ben, { showCurrentlyReading: true, visibility: "private" });
		expect(await feedTitles(ann)).toEqual([]);
		await updateOwnProfile(ben, { visibility: "friends" });
		expect(await feedTitles(ann)).toHaveLength(2);
		// Dan is not a friend.
		expect(await feedTitles(dan)).toEqual([]);
	});

	test("unfriending, blocking and a ban hide past events; befriending shows them", async () => {
		await addBook(ben, "bbbb0030");
		await push(ben, "bbbb0030", { wordPosition: 100 });
		expect(await feedTitles(ann)).toHaveLength(1);
		await removeFriend(ann, ben);
		expect(await feedTitles(ann)).toEqual([]);
		await db.transaction((tx) => createFriendship(tx, ann, ben, now));
		expect(await feedTitles(ann)).toHaveLength(1);

		await db.update(user).set({ banned: true }).where(eq(user.id, ben));
		expect(await feedTitles(ann)).toEqual([]);
		await db.update(user).set({ banned: false }).where(eq(user.id, ben));

		await blockUser(ben, ann);
		expect(await feedTitles(ann)).toEqual([]);
		expect((await listFeed(ben, { now })).items.every((i) => i.isOwn)).toBe(true);
	});

	test("paging is newest first with a stable cursor; old events expire and are removed", async () => {
		await db.transaction((tx) => createFriendship(tx, ann, dan, now));
		await updateOwnProfile(dan, { visibility: "friends" });
		for (let i = 0; i < 25; i++) {
			await addBook(dan, `dddd${String(i).padStart(4, "0")}`);
		}
		for (let i = 0; i < 25; i++) {
			const at = new Date(now.getTime() - i * 60_000);
			await push(dan, `dddd${String(i).padStart(4, "0")}`, { wordPosition: 100 }, at);
		}
		const first = await listFeed(ann, { now });
		expect(first.items).toHaveLength(20);
		expect(first.items[0]?.book.title).toBe("Book dddd0000");
		const second = await listFeed(ann, { now, cursor: first.nextCursor });
		expect(second.items).toHaveLength(5);
		expect(second.nextCursor).toBeNull();
		const ids = new Set([...first.items, ...second.items].map((i) => i.id));
		expect(ids.size).toBe(25);

		await db
			.update(socialFeedEvent)
			.set({ createdAt: new Date(now.getTime() - 91 * DAY_MS) })
			.where(and(eq(socialFeedEvent.actorId, dan), eq(socialFeedEvent.bookId, "dddd0000")));
		const after = await listFeed(ann, { now });
		expect(after.items[0]?.book.title).toBe("Book dddd0001");
		expect((await eventsOf(dan)).map((e) => e.bookId)).not.toContain("dddd0000");
	});

	test("deleting an own event, the switch off, and account deletion remove events", async () => {
		await addBook(dan, "dddd1000");
		await addBook(dan, "dddd1001");
		await push(dan, "dddd1000", { wordPosition: 100 });
		await push(dan, "dddd1001", { wordPosition: 100 });
		const [first] = (await listFeed(dan, { now })).items;
		await deleteFeedEvent(ann, first?.id ?? "");
		expect(await eventsOf(dan)).toHaveLength(2);
		await deleteFeedEvent(dan, first?.id ?? "");
		expect(await eventsOf(dan)).toHaveLength(1);

		await updateOwnProfile(dan, { feedEnabled: false });
		expect(await eventsOf(dan)).toEqual([]);
		await updateOwnProfile(dan, { feedEnabled: true });
		await addBook(dan, "dddd1002");
		await push(dan, "dddd1002", { wordPosition: 100 });
		expect(await eventsOf(dan)).toHaveLength(1);

		await deleteUserAccount(dan);
		expect(await eventsOf(dan)).toEqual([]);
	});
});
