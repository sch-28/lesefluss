// @vitest-environment node
//
// Notices, decisions and restrictions against a real Postgres database.
// Skipped when DATABASE_URL is unset.
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import {
	socialAvatar,
	socialHandle,
	socialNotice,
	socialNotification,
	socialProfile,
	socialRestriction,
	socialShare,
	socialTakedown,
	syncBooks,
	syncHighlights,
} from "~/db/schema";
import { sendMail } from "~/lib/mailer";
import { claimHandle } from "~/lib/social/handle";
import { listInbox } from "~/lib/social/inbox";
import { hasBlockEitherWay } from "~/lib/social/relationship";
import { decideNotice, resendNoticeMail } from "./decide";
import { createNotice, createWebNotice, listNotices } from "./notices";
import {
	countActionedNotices,
	isSharingSuspended,
	liftRestriction,
	listRestrictions,
	REPEAT_OFFENDER,
} from "./restrictions";
import { isOriginTakenDown, takeDownBooks, takenDownBookIds } from "./takedown";

vi.mock("~/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }));
vi.mock("~/lib/social/buddy-read-eligibility", () => ({
	sharesActiveBuddyRead: vi.fn(async () => true),
}));
const mail = vi.mocked(sendMail);

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY_MS = 86_400_000;
const ban = { ban: vi.fn(async () => {}), unban: vi.fn(async () => {}) };
const admin = "test-mod-admin";
const headers = new Headers();

function mailsTo(address: string) {
	return mail.mock.calls.map((c) => c[0]).filter((m) => m.to === address);
}

describe.skipIf(!hasDb)("moderation (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const reporter = `test-mod-r-${run}`;
	const target = `test-mod-t-${run}`;
	const bystander = `test-mod-b-${run}`;
	const all = [reporter, target, bystander];
	const targetHandle = `badguy_${run}`;

	async function notices() {
		return db.select().from(socialNotice).where(inArray(socialNotice.targetUserId, all));
	}
	async function profile(userId: string) {
		const [row] = await db.select().from(socialProfile).where(eq(socialProfile.userId, userId));
		return row;
	}
	async function resetTargetHandle() {
		await db.delete(socialHandle).where(eq(socialHandle.handle, targetHandle));
		await db
			.update(socialProfile)
			.set({ handle: null, handleChangedAt: null })
			.where(eq(socialProfile.userId, target));
		await claimHandle(target, targetHandle, "Bad Guy");
	}

	beforeAll(async () => {
		await db
			.insert(user)
			.values(all.map((id) => ({ id, name: `Name ${id}`, email: `${id}@example.test` })));
		await claimHandle(reporter, `reporter_${run}`, "Reporter");
		await claimHandle(target, targetHandle, "Bad Guy");
		await claimHandle(bystander, `bystander_${run}`, "Bystander");
		await db
			.update(socialProfile)
			.set({ bio: "rude words" })
			.where(eq(socialProfile.userId, target));
		await db.insert(socialAvatar).values({ userId: target, data: Buffer.from("webp") });
	});

	beforeEach(() => {
		mail.mockClear();
		ban.ban.mockClear();
	});

	afterAll(async () => {
		await db.delete(socialNotification).where(inArray(socialNotification.recipientId, all));
		await db.delete(socialNotice).where(inArray(socialNotice.targetUserId, all));
		await db.delete(socialNotice).where(eq(socialNotice.targetRef, `@nobody_${run}`));
		await db.delete(socialRestriction).where(inArray(socialRestriction.userId, all));
		await db.delete(socialTakedown).where(inArray(socialTakedown.userId, all));
		await db.delete(socialShare).where(inArray(socialShare.senderId, all));
		await db.delete(syncBooks).where(inArray(syncBooks.userId, all));
		await db.delete(syncHighlights).where(inArray(syncHighlights.userId, all));
		await db.delete(user).where(inArray(user.id, all));
		const rows = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = rows.map((r) => r.handle).filter((h) => h.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	test("an in-app report stores a snapshot, alerts us, and can block in the same request", async () => {
		await expect(
			createNotice(reporter, {
				targetType: "profile",
				targetUserId: reporter,
				reason: "spam",
				text: "reporting myself",
			}),
		).rejects.toMatchObject({ code: "invalid" });

		const { id } = await createNotice(reporter, {
			targetType: "profile",
			targetUserId: target,
			reason: "harassment",
			text: "Their bio is abusive.",
			block: true,
		});
		const [notice] = await db.select().from(socialNotice).where(eq(socialNotice.id, id));
		expect(notice).toMatchObject({
			status: "open",
			source: "app",
			targetType: "profile",
			targetRef: targetHandle,
			targetUserId: target,
			notifierUserId: reporter,
			targetSnapshot: { handle: targetHandle, name: "Bad Guy", bio: "rude words" },
		});
		expect(await hasBlockEitherWay(db, reporter, target)).toBe(true);
		const alerts = mailsTo("notices@lesefluss.app");
		expect(alerts).toHaveLength(1);
		expect(alerts[0]?.html).toContain("Their bio is abusive.");
	});

	test("a web notice resolves a handle, keeps an unknown location as typed, and the receipt has no free text", async () => {
		const secret = `SECRET-${run}`;
		const resolved = await createWebNotice({
			targetType: "profile",
			location: `@${targetHandle}`,
			reason: "copyright",
			text: `Explanation ${secret}`,
			name: "Notifier",
			email: `notifier-${run}@example.test`,
			goodFaith: true,
		});
		const [row] = await db.select().from(socialNotice).where(eq(socialNotice.id, resolved.id));
		expect(row).toMatchObject({ source: "web", targetUserId: target, notifierName: "Notifier" });
		const receipts = mailsTo(`notifier-${run}@example.test`);
		expect(receipts).toHaveLength(1);
		expect(receipts[0]?.html).not.toContain(secret);
		expect(receipts[0]?.html).toContain(resolved.id);

		const unresolved = await createWebNotice({
			targetType: "profile",
			location: `@nobody_${run}`,
			reason: "other",
			text: "There is no such person, but I insist.",
			name: "Notifier",
			email: `notifier-${run}@example.test`,
			goodFaith: true,
		});
		const [row2] = await db.select().from(socialNotice).where(eq(socialNotice.id, unresolved.id));
		expect(row2).toMatchObject({ targetUserId: null, targetRef: `@nobody_${run}` });
		await expect(
			decideNotice({ noticeId: unresolved.id, adminId: admin, action: "remove_bio" }, { ban }),
		).rejects.toMatchObject({ code: "unresolved" });
		await decideNotice({ noticeId: unresolved.id, adminId: admin, action: "reject" }, { ban });
	});

	test("rejecting tells the notifier and nobody else", async () => {
		const open = (await notices()).filter((n) => n.status === "open");
		const appNotice = open.find((n) => n.source === "app");
		if (!appNotice) throw new Error("expected the in-app notice");
		await decideNotice({ noticeId: appNotice.id, adminId: admin, action: "reject" }, { ban });
		expect(mailsTo(`${target}@example.test`)).toHaveLength(0);
		expect((await listInbox(target, null)).items).toHaveLength(0);
		const reporterInbox = await listInbox(reporter, null);
		expect(reporterInbox.items.map((i) => i.type)).toEqual(["notice_decision"]);
		expect(reporterInbox.items[0]?.actor).toBeNull();
		expect(reporterInbox.items[0]?.payload?.text).toContain("decided not to act");
		await expect(
			decideNotice({ noticeId: appNotice.id, adminId: admin, action: "reject" }, { ban }),
		).rejects.toMatchObject({ code: "closed" });
	});

	test("removing the bio sends a statement of reasons by mail and inbox that never names the notifier", async () => {
		const webNotice = (await notices()).find((n) => n.source === "web" && n.status === "open");
		if (!webNotice) throw new Error("expected the web notice");
		const { statement } = await decideNotice(
			{ noticeId: webNotice.id, adminId: admin, action: "remove_bio", note: "Slurs in the bio." },
			{ ban },
		);
		expect((await profile(target))?.bio).toBeNull();
		expect(statement).toContain("removed the bio");
		expect(statement).toContain("Slurs in the bio.");
		expect(statement).toContain("contest");
		expect(statement).not.toContain("Notifier");
		expect(statement).not.toContain(`notifier-${run}`);
		const toTarget = mailsTo(`${target}@example.test`);
		expect(toTarget).toHaveLength(1);
		expect(toTarget[0]?.replyTo).toBe("notices@lesefluss.app");
		expect(mailsTo(`notifier-${run}@example.test`)).toHaveLength(1);
		const inbox = await listInbox(target, null);
		expect(inbox.items.map((i) => i.type)).toEqual(["statement_of_reasons"]);
		expect(inbox.items[0]?.payload?.text).toBe(statement);
		const [closed] = await db.select().from(socialNotice).where(eq(socialNotice.id, webNotice.id));
		expect(closed).toMatchObject({ status: "actioned", decision: "remove_bio" });
		expect(closed?.mailState.statement?.status).toBe("sent");
		expect(closed?.mailState.notifier?.status).toBe("sent");
	});

	test("a failed mail is recorded without undoing the action, and can be resent", async () => {
		const { id } = await createNotice(bystander, {
			targetType: "profile",
			targetUserId: target,
			reason: "other",
			text: "Avatar is a copyrighted image.",
		});
		mail.mockRejectedValueOnce(new Error("resend down"));
		await decideNotice({ noticeId: id, adminId: admin, action: "remove_avatar" }, { ban });
		expect(
			await db.select().from(socialAvatar).where(eq(socialAvatar.userId, target)),
		).toHaveLength(0);
		let [notice] = await db.select().from(socialNotice).where(eq(socialNotice.id, id));
		expect(notice?.status).toBe("actioned");
		expect(notice?.mailState.statement).toMatchObject({ status: "failed", error: "resend down" });
		expect(await resendNoticeMail(id, "statement")).toMatchObject({ status: "sent" });
		[notice] = await db.select().from(socialNotice).where(eq(socialNotice.id, id));
		expect(notice?.mailState.statement?.status).toBe("sent");
	});

	test("the third upheld notice suspends sharing automatically; open and rejected ones do not count", async () => {
		expect(await countActionedNotices(db, target)).toBe(2);
		const pending = await createNotice(bystander, {
			targetType: "profile",
			targetUserId: target,
			reason: "spam",
			text: "Still open, must not count.",
		});
		const rejected = await createNotice(bystander, {
			targetType: "profile",
			targetUserId: target,
			reason: "spam",
			text: "Will be rejected, must not count.",
		});
		await decideNotice({ noticeId: rejected.id, adminId: admin, action: "reject" }, { ban });
		expect(await countActionedNotices(db, target)).toBe(2);
		expect(await isSharingSuspended(target)).toBe(false);

		const third = await createNotice(bystander, {
			targetType: "profile",
			targetUserId: target,
			reason: "harassment",
			text: "Handle is a slur.",
		});
		try {
			const { statement } = await decideNotice(
				{ noticeId: third.id, adminId: admin, action: "reset_handle" },
				{ ban },
			);
			expect((await profile(target))?.handle).toBeNull();
			const [held] = await db
				.select()
				.from(socialHandle)
				.where(eq(socialHandle.handle, targetHandle));
			expect(held).toMatchObject({ reclaimable: false, userId: target });
			expect(held?.releasedAt).not.toBeNull();
			expect(await countActionedNotices(db, target)).toBe(REPEAT_OFFENDER.count);
			expect(await isSharingSuspended(target)).toBe(true);
			expect(statement).toContain("released your handle");
			expect(statement).toContain("In addition, we suspended sharing");
			const auto = (await listRestrictions(db, { userId: target })).find(
				(r) => r.createdBy === "auto",
			);
			expect(auto).toMatchObject({ until: null, noticeId: third.id });
		} finally {
			// Later tests need the handle back and no suspension, whatever failed above.
			await decideNotice({ noticeId: pending.id, adminId: admin, action: "reject" }, { ban });
			await resetTargetHandle();
			for (const r of await listRestrictions(db, { userId: target, activeOnly: true })) {
				await liftRestriction(r.id, admin);
			}
		}
		expect(await isSharingSuspended(target)).toBe(false);
	});

	test("a timed suspension expires by the clock and can be lifted early", async () => {
		const now = new Date();
		const { id } = await createNotice(bystander, {
			targetType: "profile",
			targetUserId: target,
			reason: "spam",
			text: "Sends junk shares.",
		});
		await decideNotice(
			{ noticeId: id, adminId: admin, action: "suspend_sharing", duration: "7d", now },
			{ ban },
		);
		expect(await isSharingSuspended(target, now)).toBe(true);
		expect(await isSharingSuspended(target, new Date(now.getTime() + 6 * DAY_MS))).toBe(true);
		expect(await isSharingSuspended(target, new Date(now.getTime() + 8 * DAY_MS))).toBe(false);
		const [active] = await listRestrictions(db, { userId: target, activeOnly: true, now });
		if (!active) throw new Error("expected an active restriction");
		expect(await liftRestriction(active.id, admin)).toBe(true);
		expect(await isSharingSuspended(target, now)).toBe(false);
		expect(await liftRestriction(active.id, admin)).toBe(false);
	});

	test("a book takedown tombstones the row and its highlights, writes the record, and the push refuses the book", async () => {
		const now = new Date();
		await db.insert(syncBooks).values([
			{
				userId: target,
				bookId: "bad-book",
				originUserId: target,
				originBookId: "bad-book",
				title: "Pirated",
				author: "Someone",
				content: "full text",
				coverImage: "data:image/png;base64,AAAA",
				chapters: "[]",
				updatedAt: now,
			},
			{
				userId: target,
				bookId: "fine-book",
				originUserId: target,
				originBookId: "fine-book",
				title: "Fine",
				content: "keep",
				updatedAt: now,
			},
		]);
		await db.insert(syncHighlights).values([
			{
				userId: target,
				highlightId: "h1",
				bookId: "bad-book",
				startWord: 0,
				endWord: 1,
				createdAt: now,
				updatedAt: now,
			},
			{
				userId: target,
				highlightId: "h2",
				bookId: "fine-book",
				startWord: 0,
				endWord: 1,
				createdAt: now,
				updatedAt: now,
			},
		]);
		// A shared book is reported through the share the reporter received.
		const [share] = await db
			.insert(socialShare)
			.values({
				senderId: target,
				recipientId: bystander,
				bookId: "bad-book",
				originUserId: target,
				originBookId: "bad-book",
				title: "Pirated",
				status: "accepted",
			})
			.returning({ id: socialShare.id });
		const { id } = await createNotice(bystander, {
			targetType: "shared_book",
			targetUserId: target,
			subjectId: share?.id,
			reason: "copyright",
			text: "This is my book, shared without permission.",
		});
		const [notice] = await db.select().from(socialNotice).where(eq(socialNotice.id, id));
		expect(notice).toMatchObject({
			targetRef: `${target}:bad-book`,
			targetSnapshot: { title: "Pirated", author: "Someone" },
		});
		expect(notice?.targetSnapshot).not.toHaveProperty("content");

		const { statement } = await decideNotice(
			{ noticeId: id, adminId: admin, action: "take_down_book" },
			{ ban },
		);
		expect(statement).toContain('"Pirated"');
		const books = await db.select().from(syncBooks).where(eq(syncBooks.userId, target));
		const bad = books.find((b) => b.bookId === "bad-book");
		const fine = books.find((b) => b.bookId === "fine-book");
		expect(bad).toMatchObject({ deleted: true, content: null, coverImage: null, chapters: null });
		expect(fine).toMatchObject({ deleted: false, content: "keep" });
		const highlights = await db
			.select()
			.from(syncHighlights)
			.where(eq(syncHighlights.userId, target));
		expect(highlights.find((h) => h.highlightId === "h1")?.deleted).toBe(true);
		expect(highlights.find((h) => h.highlightId === "h2")?.deleted).toBe(false);
		expect(
			await db.select().from(socialTakedown).where(eq(socialTakedown.userId, target)),
		).toMatchObject([{ bookId: "bad-book", scope: "copy", noticeId: id }]);

		// The device that was offline pushes the book again, after the tombstone was cleaned up.
		await db
			.delete(syncBooks)
			.where(and(eq(syncBooks.userId, target), eq(syncBooks.bookId, "bad-book")));
		const refused = await takenDownBookIds(db, target, ["bad-book", "fine-book", "new-book"]);
		expect([...refused]).toEqual(["bad-book"]);
	});

	test("isOriginTakenDown is true only for origin-scope records", async () => {
		expect(await isOriginTakenDown(target, "bad-book")).toBe(false);
		await db.transaction((tx) =>
			takeDownBooks(
				tx,
				[
					{
						userId: bystander,
						bookId: "copy-1",
						originUserId: target,
						originBookId: "src-1",
					},
				],
				null,
				"origin",
			),
		);
		expect(await isOriginTakenDown(target, "src-1")).toBe(true);
		expect(await isOriginTakenDown(target, "src-2")).toBe(false);
	});

	test("banning goes through the auth dependency and the queue orders open notices first", async () => {
		const { id } = await createNotice(bystander, {
			targetType: "profile",
			targetUserId: target,
			reason: "illegal",
			text: "Illegal content in the bio.",
		});
		const list = await listNotices({ targetType: "profile" });
		expect(list[0]?.status).toBe("open");
		expect(list.filter((n) => n.status === "open").map((n) => n.id)).toContain(id);
		await decideNotice(
			{ noticeId: id, adminId: admin, action: "ban", note: "Repeated illegal content.", headers },
			{ ban },
		);
		expect(ban.ban).toHaveBeenCalledWith(target, expect.stringContaining("Repeated"), headers);
		expect(await listNotices({ status: "open", targetType: "profile" })).not.toContainEqual(
			expect.objectContaining({ id }),
		);
	});

	test("closed notices older than 24 months are purged on queue load", async () => {
		const [old] = await db
			.insert(socialNotice)
			.values({
				targetType: "profile",
				targetRef: `@${targetHandle}`,
				targetUserId: target,
				reason: "spam",
				text: "ancient",
				source: "web",
				status: "rejected",
				createdAt: new Date(Date.now() - 800 * DAY_MS),
				decidedAt: new Date(Date.now() - 731 * DAY_MS),
			})
			.returning({ id: socialNotice.id });
		await listNotices();
		expect(
			await db
				.select()
				.from(socialNotice)
				.where(eq(socialNotice.id, old?.id ?? "")),
		).toHaveLength(0);
		const remaining = await notices();
		expect(remaining.length).toBeGreaterThan(0);
	});
});
