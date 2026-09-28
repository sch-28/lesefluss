// @vitest-environment node
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import {
	buddyRead,
	socialBlock,
	socialHandle,
	socialNotification,
	syncBookCopy,
	syncBooks,
} from "~/db/schema";
import { createBuddyRead, respondToBuddyReadInvite } from "./buddy-reads";
import { createFriendship } from "./friends";
import { claimHandle } from "./handle";
import { listInbox } from "./inbox";
import { liveBoard, reportLive, snapshotFor, stopLive } from "./live";
import { updateOwnProfile } from "./profile";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("live board (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const names = ["ada", "bo", "cy", "dee"] as const;
	const id = Object.fromEntries(names.map((n) => [n, `test-live-${n}-${run}`])) as Record<
		(typeof names)[number],
		string
	>;
	const all = Object.values(id);
	const { ada, bo, cy, dee } = id;
	let readId = "";

	async function joinByInvite(userId: string) {
		const [item] = (await listInbox(userId, null)).items.filter(
			(i) => i.type === "buddy_read_invite",
		);
		const inviteId = item?.subject?.kind === "buddy_read_invite" ? item.subject.inviteId : "";
		await respondToBuddyReadInvite(userId, inviteId, "accept");
	}

	const report = (position: number) => ({ position, mode: "scroll" as const, dialWpm: null });

	async function viewer(userId: string) {
		const { visibleTo, loadState } = await import("./buddy-reads");
		const [read] = await db
			.select()
			.from(buddyRead)
			.where(inArray(buddyRead.id, [readId]));
		if (!read) throw new Error("no read");
		const state = await loadState(db, read, new Date());
		return { userId, isLive: true, visible: await visibleTo(db, userId, state.users, new Date()) };
	}

	beforeAll(async () => {
		process.env.BETTER_AUTH_SECRET ??= "test-secret";
		process.env.BETTER_AUTH_URL ??= "https://lesefluss.test";
		const now = new Date();
		await db
			.insert(user)
			.values(all.map((u) => ({ id: u, name: `Name ${u}`, email: `${u}@example.test` })));
		for (const n of names) await claimHandle(id[n], `${n}_${run}`, n);
		for (const n of ["bo", "cy"] as const) {
			await db.transaction((tx) => createFriendship(tx, ada, id[n], now));
		}
		await db.insert(syncBooks).values({
			userId: ada,
			bookId: "eeee0002",
			originUserId: ada,
			originBookId: "eeee0002",
			title: "Live",
			content: "text",
			wordCount: 5000,
			wordPosition: 0,
			updatedAt: now,
		});
		({ buddyReadId: readId } = await createBuddyRead(ada, {
			bookId: "eeee0002",
			inviteeIds: [bo, cy],
		}));
		await joinByInvite(bo);
		await joinByInvite(cy);
	});

	afterAll(async () => {
		for (const u of all) liveBoard.stopEverywhere(u);
		await db.delete(buddyRead).where(inArray(buddyRead.originUserId, all));
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		await db.delete(syncBookCopy).where(inArray(syncBookCopy.userId, all));
		await db.delete(syncBooks).where(inArray(syncBooks.userId, all));
		await db.delete(user).where(inArray(user.id, all));
		const rows = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = rows.map((r) => r.handle).filter((h) => h.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	test("members see each other reading, never themselves, and stop ends it", async () => {
		await reportLive(bo, readId, report(10));
		await reportLive(cy, readId, report(20));
		const seenByAda = snapshotFor(readId, await viewer(ada), Date.now());
		expect(seenByAda.live).toBe(true);
		expect(seenByAda.members.map((m) => m.userId).sort()).toEqual([bo, cy].sort());
		expect(seenByAda.members.find((m) => m.userId === bo)).toMatchObject({
			wordPosition: 10,
			wordCount: 5000,
		});
		expect(snapshotFor(readId, await viewer(bo), Date.now()).members.map((m) => m.userId)).toEqual([
			cy,
		]);

		stopLive(cy, readId);
		expect(snapshotFor(readId, await viewer(ada), Date.now()).members.map((m) => m.userId)).toEqual(
			[bo],
		);
	});

	test("reports from non-members or past the copy's end are rejected", async () => {
		await expect(reportLive(dee, readId, report(1))).rejects.toMatchObject({ code: "not_found" });
		await expect(reportLive(bo, readId, report(5001))).rejects.toMatchObject({ code: "invalid" });
	});

	test("a block hides both sides from each other", async () => {
		await reportLive(bo, readId, report(30));
		await reportLive(cy, readId, report(40));
		await db.insert(socialBlock).values({ blockerId: cy, blockedId: bo });
		try {
			expect(
				snapshotFor(readId, await viewer(cy), Date.now()).members.map((m) => m.userId),
			).toEqual([]);
			expect(
				snapshotFor(readId, await viewer(bo), Date.now()).members.map((m) => m.userId),
			).toEqual([]);
			expect(
				snapshotFor(readId, await viewer(ada), Date.now())
					.members.map((m) => m.userId)
					.sort(),
			).toEqual([bo, cy].sort());
		} finally {
			await db.delete(socialBlock).where(inArray(socialBlock.blockerId, [cy]));
		}
	});

	test("opting out takes the user off the board and drops their later reports", async () => {
		await reportLive(bo, readId, report(50));
		await updateOwnProfile(bo, { shareLiveReading: false });
		expect(
			snapshotFor(readId, await viewer(ada), Date.now()).members.map((m) => m.userId),
		).not.toContain(bo);
		await reportLive(bo, readId, report(60));
		expect(
			snapshotFor(readId, await viewer(ada), Date.now()).members.map((m) => m.userId),
		).not.toContain(bo);

		const optedOut = snapshotFor(readId, { ...(await viewer(bo)), isLive: false }, Date.now());
		expect(optedOut).toEqual({ buddyReadId: readId, live: false, members: [] });
		await updateOwnProfile(bo, { shareLiveReading: true });
	});
});
