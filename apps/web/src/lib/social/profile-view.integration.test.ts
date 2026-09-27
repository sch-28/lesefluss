// @vitest-environment node
//
// Profile view resolver against a real Postgres database. Skipped when
// DATABASE_URL is unset.
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { db } from "~/db";
import { user } from "~/db/auth-schema";
import {
	socialBlock,
	socialFriendship,
	socialHandle,
	syncBooks,
	syncReadingSessions,
	syncSeries,
} from "~/db/schema";
import { signCoverToken, verifyCoverToken } from "./cover-token";
import { claimHandle } from "./handle";
import { updateOwnProfile } from "./profile";
import { mayViewCover, resolveProfileView } from "./profile-view";

const hasDb = Boolean(process.env.DATABASE_URL);
const DAY_MS = 86_400_000;

async function expectNotFound(promise: Promise<unknown>) {
	await expect(promise).rejects.toMatchObject({ code: "not_found" });
}

describe.skipIf(!hasDb)("profile view (integration)", () => {
	const run = randomUUID().slice(0, 8);
	const owner = `test-pv-o-${run}`;
	const friend = `test-pv-f-${run}`;
	const stranger = `test-pv-s-${run}`;
	const noHandle = `test-pv-n-${run}`;
	const all = [owner, friend, stranger, noHandle];
	const now = new Date("2026-06-15T12:00:00Z");

	beforeAll(async () => {
		process.env.BETTER_AUTH_SECRET ??= "test-secret";
		process.env.BETTER_AUTH_URL ??= "https://lesefluss.test";
		await db
			.insert(user)
			.values(all.map((id) => ({ id, name: `Name ${id}`, email: `${id}@example.test` })));
		await claimHandle(owner, `owner_${run}`, "Owner");
		await claimHandle(friend, `friend_${run}`, "Friend");
		await claimHandle(stranger, `stranger_${run}`, "Stranger");
		const [low, high] = owner < friend ? [owner, friend] : [friend, owner];
		await db.insert(socialFriendship).values({ userLow: low, userHigh: high, acceptedAt: now });
		await updateOwnProfile(owner, { bio: "Reads at night", visibility: "friends" });

		const t = (ms: number) => new Date(now.getTime() - ms);
		await db.insert(syncBooks).values([
			// currently reading, uploaded cover
			{
				userId: owner,
				bookId: "aaaa0001",
				originUserId: owner,
				originBookId: "aaaa0001",
				title: "Reading One",
				author: "A",
				wordCount: 1000,
				wordPosition: 400,
				coverImage: "data:image/png;base64,AAAA",
				updatedAt: now,
				review: "secret review",
				tags: '["private"]',
			},
			// finished this year, catalog cover
			{
				userId: owner,
				bookId: "aaaa0002",
				originUserId: owner,
				originBookId: "aaaa0002",
				title: "Done",
				author: "B",
				wordCount: 1000,
				wordPosition: 990,
				finishedAt: t(10 * DAY_MS),
				rating: 7,
				catalogId: "gutenberg:1342",
				updatedAt: now,
			},
			// finished last year
			{
				userId: owner,
				bookId: "aaaa0003",
				originUserId: owner,
				originBookId: "aaaa0003",
				title: "Old",
				author: "C",
				wordCount: 1000,
				wordPosition: 1000,
				finishedAt: new Date("2025-03-01T00:00:00Z"),
				status: "finished",
				updatedAt: now,
			},
			// hidden from profile
			{
				userId: owner,
				bookId: "aaaa0004",
				originUserId: owner,
				originBookId: "aaaa0004",
				title: "Hidden",
				author: "D",
				wordCount: 1000,
				wordPosition: 500,
				hideFromProfile: true,
				updatedAt: now,
			},
			// article
			{
				userId: owner,
				bookId: "aaaa0005",
				originUserId: owner,
				originBookId: "aaaa0005",
				title: "Article",
				author: null,
				wordCount: 500,
				wordPosition: 250,
				source: "url",
				sourceUrl: "https://x.test/a",
				updatedAt: now,
			},
			// deleted
			{
				userId: owner,
				bookId: "aaaa0006",
				originUserId: owner,
				originBookId: "aaaa0006",
				title: "Gone",
				author: null,
				wordCount: 100,
				wordPosition: 50,
				deleted: true,
				updatedAt: now,
			},
			// want (untouched)
			{
				userId: owner,
				bookId: "aaaa0007",
				originUserId: owner,
				originBookId: "aaaa0007",
				title: "Later",
				author: null,
				wordCount: 100,
				wordPosition: 0,
				updatedAt: now,
			},
			// serial chapters
			{
				userId: owner,
				bookId: "aaaa0008",
				originUserId: owner,
				originBookId: "aaaa0008",
				title: "Ch 1",
				author: null,
				wordCount: 100,
				wordPosition: 100,
				seriesId: "5e51e501",
				chapterIndex: 0,
				updatedAt: now,
			},
			{
				userId: owner,
				bookId: "aaaa0009",
				originUserId: owner,
				originBookId: "aaaa0009",
				title: "Ch 2",
				author: null,
				wordCount: 100,
				wordPosition: 30,
				seriesId: "5e51e501",
				chapterIndex: 1,
				updatedAt: now,
			},
		]);
		await db.insert(syncSeries).values({
			userId: owner,
			seriesId: "5e51e501",
			title: "The Serial",
			author: "S",
			sourceUrl: "https://s.test",
			tocUrl: "https://s.test/toc",
			provider: "royalroad",
			coverImage: "data:image/jpeg;base64,BBBB",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(syncReadingSessions).values([
			{
				userId: owner,
				sessionId: "s1",
				bookId: "aaaa0001",
				mode: "scroll",
				startedAt: t(DAY_MS),
				endedAt: t(DAY_MS - 600_000),
				durationMs: 600_000,
				wordsRead: 3000,
				startWord: 0,
				endWord: 3000,
				updatedAt: now,
			},
			// hidden book's session must not count
			{
				userId: owner,
				sessionId: "s2",
				bookId: "aaaa0004",
				mode: "scroll",
				startedAt: t(DAY_MS),
				endedAt: t(DAY_MS - 600_000),
				durationMs: 600_000,
				wordsRead: 9000,
				startWord: 0,
				endWord: 9000,
				updatedAt: now,
			},
			// position jump: counts for time, not for speed
			{
				userId: owner,
				sessionId: "s3",
				bookId: "aaaa0002",
				mode: "scroll",
				startedAt: t(DAY_MS),
				endedAt: t(DAY_MS - 27_000),
				durationMs: 27_000,
				wordsRead: 22_488,
				startWord: 0,
				endWord: 22_488,
				updatedAt: now,
			},
		]);
	});

	afterAll(async () => {
		await db.delete(syncBooks).where(inArray(syncBooks.userId, all));
		await db.delete(syncSeries).where(inArray(syncSeries.userId, all));
		await db.delete(syncReadingSessions).where(inArray(syncReadingSessions.userId, all));
		await db.delete(user).where(inArray(user.id, all));
		const rows = await db.select({ handle: socialHandle.handle }).from(socialHandle);
		const mine = rows.map((r) => r.handle).filter((h) => h.endsWith(`_${run}`));
		if (mine.length > 0) await db.delete(socialHandle).where(inArray(socialHandle.handle, mine));
	});

	test("a friend of a friends-visible profile sees header, bio, count and every section", async () => {
		const view = await resolveProfileView(friend, owner, { now });
		expect(view.header).toMatchObject({
			identity: { userId: owner, handle: `owner_${run}`, name: "Owner" },
			relation: "friend",
			friendsSince: now.getTime(),
		});
		expect(view.bio).toBe("Reads at night");
		expect(view.friendCount).toBe(1);

		const reading = view.sections.currentlyReading ?? [];
		expect(reading.map((b) => b.title).sort()).toEqual(["Reading One", "The Serial"]);
		const one = reading.find((b) => b.title === "Reading One");
		expect(one).toMatchObject({ progressPercent: 40 });
		expect(one?.cover?.kind).toBe("url");
		const serial = reading.find((b) => b.title === "The Serial");
		expect(serial).toMatchObject({ key: "5e51e501", author: "S", progressPercent: 65 });
		expect(serial?.cover?.kind).toBe("url");

		const finished = view.sections.finished ?? [];
		expect(finished.map((b) => b.title)).toEqual(["Done", "Old"]);
		expect(finished[0]).toMatchObject({
			rating: 7,
			finishedOn: "2026-06-05",
			cover: { kind: "catalog", catalogId: "gutenberg:1342" },
		});

		expect(view.sections.stats).toEqual({
			booksFinishedThisYear: 1,
			// 400 + 990 + 1000 + 0 + 250 (article counts) + 100 + 30; hidden and deleted excluded
			wordsRead: 2770,
			readingTimeMs: 627_000,
			readingSpeedWpm: 300,
			// Read yesterday only: the streak is still current until today ends.
			currentStreakDays: 1,
			longestStreakDays: 1,
		});

		const json = JSON.stringify(view);
		for (const leak of [
			"secret review",
			"private",
			"email",
			"example.test",
			"Hidden",
			"Article",
			"Gone",
			"Later",
		]) {
			expect(json).not.toContain(leak);
		}
		expect(json).not.toContain("base64");
	});

	test("a private profile shows a friend the header only", async () => {
		await updateOwnProfile(owner, { visibility: "private" });
		const view = await resolveProfileView(friend, owner, { now });
		expect(view.header.relation).toBe("friend");
		expect(view.bio).toBeUndefined();
		expect(view.friendCount).toBeUndefined();
		expect(view.sections).toEqual({});
		await updateOwnProfile(owner, { visibility: "friends" });
	});

	test("section toggles hide sections for friends but not for the owner", async () => {
		await updateOwnProfile(owner, { showStats: false, showFinished: false });
		const asFriend = await resolveProfileView(friend, owner, { now });
		expect(asFriend.sections.stats).toBeUndefined();
		expect(asFriend.sections.finished).toBeUndefined();
		expect(asFriend.sections.currentlyReading).toBeDefined();
		const self = await resolveProfileView(owner, owner, { now });
		expect(self.header.relation).toBe("self");
		expect(self.sections.stats).toBeDefined();
		expect(self.sections.finished).toBeDefined();
		// The preview honours the toggles exactly like a friend does. Cover URLs
		// are signed per viewer, so they are compared by kind only.
		const preview = await resolveProfileView(owner, owner, { now, asFriend: true });
		expect(preview.header.relation).toBe("friend");
		const withoutCoverUrls = (sections: unknown) =>
			JSON.parse(JSON.stringify(sections, (key, value) => (key === "url" ? "signed" : value)));
		expect(withoutCoverUrls(preview.sections)).toEqual(withoutCoverUrls(asFriend.sections));
		await updateOwnProfile(owner, { showStats: true, showFinished: true });
	});

	test("strangers, blocks, banned or handle-less owners and unknown users are all not found", async () => {
		await expectNotFound(resolveProfileView(stranger, owner, { now }));
		await expectNotFound(resolveProfileView(friend, "nobody", { now }));
		await expectNotFound(resolveProfileView(friend, noHandle, { now }));
		await expectNotFound(resolveProfileView(noHandle, owner, { now }));
		await db.insert(socialBlock).values({ blockerId: owner, blockedId: friend });
		await db
			.delete(socialFriendship)
			.where(eq(socialFriendship.userLow, owner < friend ? owner : friend));
		await expectNotFound(resolveProfileView(friend, owner, { now }));
		await db.delete(socialBlock).where(eq(socialBlock.blockerId, owner));
		const [low, high] = owner < friend ? [owner, friend] : [friend, owner];
		await db.insert(socialFriendship).values({ userLow: low, userHigh: high, acceptedAt: now });
		await db.update(user).set({ banned: true }).where(eq(user.id, owner));
		await expectNotFound(resolveProfileView(friend, owner, { now }));
		await db.update(user).set({ banned: false }).where(eq(user.id, owner));
	});

	test("without synced sessions time and speed are absent, not zero", async () => {
		await updateOwnProfile(owner, { visibility: "friends", showStats: true, showFinished: true });
		await db.delete(syncReadingSessions).where(eq(syncReadingSessions.userId, owner));
		const view = await resolveProfileView(friend, owner, { now });
		expect(view.sections.stats).toMatchObject({
			readingTimeMs: null,
			readingSpeedWpm: null,
			currentStreakDays: null,
			longestStreakDays: null,
		});
	});

	test("the year boundary follows the owner's time zone", async () => {
		const newYear = new Date("2026-01-01T03:00:00Z");
		await db
			.update(syncBooks)
			.set({ finishedAt: new Date("2025-12-31T23:30:00Z") })
			.where(eq(syncBooks.bookId, "aaaa0002"));
		const utc = await resolveProfileView(friend, owner, { now: newYear });
		expect(utc.sections.stats?.booksFinishedThisYear).toBe(0);
		const berlin = await resolveProfileView(friend, owner, {
			now: newYear,
			timeZone: "Europe/Berlin",
		});
		expect(berlin.sections.stats?.booksFinishedThisYear).toBe(1);
	});

	test("cover tokens are viewer-bound and friendship-checked at serve time", async () => {
		const token = signCoverToken({ kind: "book", ownerId: owner, id: "aaaa0001" }, friend);
		const verified = verifyCoverToken(token);
		expect(verified).toMatchObject({
			kind: "book",
			ownerId: owner,
			id: "aaaa0001",
			viewerId: friend,
		});
		expect(verifyCoverToken(`${token}x`)).toBeNull();
		expect(verifyCoverToken(token, Date.now() + 2 * 60 * 60_000)).toBeNull();
		expect(await mayViewCover(friend, { kind: "book", ownerId: owner, id: "aaaa0001" })).toBe(true);
		expect(await mayViewCover(stranger, { kind: "book", ownerId: owner, id: "aaaa0001" })).toBe(
			false,
		);
		expect(await mayViewCover(owner, { kind: "book", ownerId: owner, id: "aaaa0001" })).toBe(true);
		await db.update(user).set({ banned: true }).where(eq(user.id, friend));
		expect(await mayViewCover(friend, { kind: "book", ownerId: owner, id: "aaaa0001" })).toBe(
			false,
		);
		await db.update(user).set({ banned: false }).where(eq(user.id, friend));
	});
});
