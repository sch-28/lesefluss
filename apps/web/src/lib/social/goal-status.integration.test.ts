// @vitest-environment node
//
// Members' goal status on a buddy read against a real Postgres database.
// Skipped when DATABASE_URL is unset. Tests build on each other's state in file order.
import { randomUUID } from "node:crypto";
import { addDays } from "@lesefluss/core";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import {
	buddyRead,
	buddyReadMember,
	socialHandle,
	socialNotification,
	socialProfile,
	socialTakedown,
	syncBookCopy,
	syncBooks,
	syncReadingGoals,
} from "~/db/schema";
import { wipeReadingGoals, wipeReadingStats } from "../sync-wipe";
import {
	createBuddyRead,
	getBuddyRead,
	getBuddyReadProgress,
	respondToBuddyReadInvite,
	setBuddyReadTargetDate,
} from "./buddy-reads";
import { createFriendship } from "./friends";
import { memberGoalStatuses } from "./goal-status";
import { claimHandle } from "./handle";
import { dayOf } from "./profile-stats";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));

const hasDb = Boolean(process.env.DATABASE_URL);
const ZONE = "Europe/Berlin";

describe.skipIf(!hasDb)("buddy-read goal status (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const alice = `test-gs-alice-${run}`;
	const bob = `test-gs-bob-${run}`;
	const sam = `test-gs-sam-${run}`;
	const all = [alice, bob, sam];
	const now = new Date();
	const today = dayOf(now, ZONE) ?? "";
	let readId = "";
	let bobBook = "";

	async function setProfile(
		userId: string,
		values: { shareLiveReading?: boolean; timeZone?: string | null },
	) {
		await db
			.insert(socialProfile)
			.values({ userId, ...values })
			.onConflictDoUpdate({ target: socialProfile.userId, set: values });
	}

	/** A deadline goal over ten days on a 100-word book: the plan line moves 10 words a day. */
	async function addGoal(
		userId: string,
		bookId: string,
		extra: Partial<typeof syncReadingGoals.$inferInsert> = {},
	) {
		await db.insert(syncReadingGoals).values({
			userId,
			goalId: `g-${randomUUID().slice(0, 8)}`,
			bookId,
			mode: "deadline",
			status: "active",
			startedAt: now,
			startWord: 0,
			planStartDate: today,
			planStartWord: 0,
			targetDate: addDays(today, 9),
			dailyPercent: 10,
			carriedDaysMet: 0,
			reminderTime: null,
			deleted: false,
			createdAt: now,
			updatedAt: now,
			...extra,
		});
	}

	async function setPosition(userId: string, bookId: string, wordPosition: number) {
		await db
			.update(syncBooks)
			.set({ wordPosition })
			.where(and(eq(syncBooks.userId, userId), eq(syncBooks.bookId, bookId)));
	}

	async function bobStatus() {
		const progress = await getBuddyReadProgress(alice, readId);
		return progress.participants.find((p) => p.userId === bob)?.goal;
	}

	beforeAll(async () => {
		process.env.BETTER_AUTH_SECRET ??= "test-secret";
		process.env.BETTER_AUTH_URL ??= "https://lesefluss.test";
		await db
			.insert(user)
			.values(all.map((u) => ({ id: u, name: `Name ${u}`, email: `${u}@example.test` })));
		for (const [i, u] of all.entries()) await claimHandle(u, `gs${i}_${run}`, `gs${i}`);
		await db.transaction((tx) => createFriendship(tx, alice, bob, now));
		await db.insert(syncBooks).values({
			userId: alice,
			bookId: "a1a1a1a1",
			originUserId: alice,
			originBookId: "a1a1a1a1",
			title: "Moby-Dick",
			content: "Call me Ishmael.",
			wordCount: 100,
			wordPosition: 0,
			updatedAt: now,
		});
		({ buddyReadId: readId } = await createBuddyRead(alice, {
			bookId: "a1a1a1a1",
			inviteeIds: [bob],
		}));
		const [invite] = await db.query.buddyReadInvite.findMany({
			where: (t, { eq: e }) => e(t.inviteeId, bob),
		});
		if (!invite) throw new Error("no invite for bob");
		await respondToBuddyReadInvite(bob, invite.id, "accept");
		const [row] = await db
			.select()
			.from(buddyReadMember)
			.where(and(eq(buddyReadMember.buddyReadId, readId), eq(buddyReadMember.userId, bob)));
		bobBook = row?.bookId ?? "";
		await db
			.update(syncBooks)
			.set({ wordPosition: 30, wordCount: 100 })
			.where(and(eq(syncBooks.userId, bob), eq(syncBooks.bookId, bobBook)));
		await setProfile(alice, { shareLiveReading: true, timeZone: ZONE });
		await setProfile(bob, { shareLiveReading: true, timeZone: ZONE });
	});

	afterAll(async () => {
		await db.delete(buddyRead).where(inArray(buddyRead.originUserId, all));
		await db.delete(syncReadingGoals).where(inArray(syncReadingGoals.userId, all));
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		await db.delete(socialTakedown).where(inArray(socialTakedown.userId, all));
		await db.delete(syncBookCopy).where(inArray(syncBookCopy.userId, all));
		await db.delete(syncBooks).where(inArray(syncBooks.userId, all));
		await db.delete(user).where(inArray(user.id, all));
		const rows = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = rows.map((r) => r.handle).filter((h) => h.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	test("only the host sets or changes the deadline, and only members see it", async () => {
		const target = now.getTime() + 5 * 86_400_000;
		await expect(setBuddyReadTargetDate(bob, readId, target)).rejects.toMatchObject({
			code: "not_host",
		});
		await expect(setBuddyReadTargetDate(sam, readId, target)).rejects.toMatchObject({
			code: "not_found",
		});
		await setBuddyReadTargetDate(alice, readId, target);
		await setBuddyReadTargetDate(alice, readId, target + 86_400_000);
		expect((await getBuddyRead(bob, readId)).targetDate).toBe(target + 86_400_000);
		await expect(getBuddyRead(sam, readId)).rejects.toMatchObject({ code: "not_found" });
		await expect(getBuddyReadProgress(sam, readId)).rejects.toMatchObject({ code: "not_found" });
	});

	test("a member without a goal shows no status", async () => {
		expect(await bobStatus()).toBeNull();
	});

	test("a goal on the member's buddy-read copy shows how far ahead of its plan they are", async () => {
		await addGoal(bob, bobBook);
		// Plan line at the end of today: 10 of 100 words. Bob is at 30.
		expect(await bobStatus()).toEqual({ aheadDays: 2 });
	});

	test("nothing shows unless both the viewer and the member share live activity", async () => {
		await setProfile(alice, { shareLiveReading: false });
		expect(await bobStatus()).toBeNull();
		await setProfile(alice, { shareLiveReading: true });
		await setProfile(bob, { shareLiveReading: false });
		expect(await bobStatus()).toBeNull();
		await setProfile(bob, { shareLiveReading: true });
		expect(await bobStatus()).not.toBeNull();
	});

	test("nothing shows without the member's time zone, which decides their day", async () => {
		await setProfile(bob, { timeZone: null });
		expect(await bobStatus()).toBeNull();
		await setProfile(bob, { timeZone: "Not/AZone" });
		expect(await bobStatus()).toBeNull();
		await setProfile(bob, { timeZone: ZONE });
	});

	test("a member who finished the book shows nothing, even before their goal syncs as completed", async () => {
		await setPosition(bob, bobBook, 96);
		expect(await bobStatus()).toBeNull();
		await setPosition(bob, bobBook, 30);
		expect(await bobStatus()).not.toBeNull();
	});

	test("goals leave the server with the stats opt-out and with Delete reading stats", async () => {
		await wipeReadingGoals(bob);
		expect(await bobStatus()).toBeNull();
		expect(
			await db.select().from(syncReadingGoals).where(eq(syncReadingGoals.userId, bob)),
		).toEqual([]);

		await addGoal(bob, bobBook);
		expect(await bobStatus()).not.toBeNull();
		await wipeReadingStats(bob);
		expect(await bobStatus()).toBeNull();
		await addGoal(bob, bobBook);
	});

	test("a goal only counts on the member's own live, not taken-down copy of the book", async () => {
		await db.delete(syncReadingGoals).where(eq(syncReadingGoals.userId, bob));
		// A pushed goal pointing at a book bob does not hold, or at another of his books.
		await addGoal(bob, "ffffffff");
		await db.insert(syncBooks).values({
			userId: bob,
			bookId: "b2b2b2b2",
			originUserId: bob,
			originBookId: "b2b2b2b2",
			title: "Other",
			wordCount: 100,
			wordPosition: 90,
			updatedAt: now,
		});
		await addGoal(bob, "b2b2b2b2");
		expect(await bobStatus()).toBeNull();

		await addGoal(bob, bobBook, { status: "completed" });
		await addGoal(bob, bobBook, { deleted: true });
		expect(await bobStatus()).toBeNull();

		await addGoal(bob, bobBook);
		expect(await bobStatus()).not.toBeNull();

		await db.insert(socialTakedown).values({ scope: "copy", userId: bob, bookId: bobBook });
		expect(await memberGoalStatuses(db, alice, [{ userId: bob, bookId: bobBook }], now)).toEqual(
			new Map(),
		);
		await db.delete(socialTakedown).where(eq(socialTakedown.userId, bob));

		await db
			.update(syncBooks)
			.set({ deleted: true })
			.where(and(eq(syncBooks.userId, bob), eq(syncBooks.bookId, bobBook)));
		expect(await memberGoalStatuses(db, alice, [{ userId: bob, bookId: bobBook }], now)).toEqual(
			new Map(),
		);
	});
});
