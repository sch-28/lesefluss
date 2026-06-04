// @vitest-environment node
//
// Account-deletion smoke test against a real Postgres database. Skipped when
// DATABASE_URL is unset (e.g. CI without a DB) so it never breaks `pnpm test`.
// Run locally with:
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/rsvp pnpm test account-deletion
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, test } from "vitest";
import { db } from "~/db";
import { account, session, user } from "~/db/auth-schema";
import {
	syncBooks,
	syncGlossaryEntries,
	syncHighlights,
	syncReadingSessions,
	syncSeries,
	syncSettings,
} from "~/db/schema";
import { deleteUserAccount } from "./account-deletion";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("deleteUserAccount (integration)", () => {
	const userId = `test-del-${randomUUID()}`;
	const now = new Date();
	const future = new Date(now.getTime() + 60 * 60 * 1000);

	// Cleanup in case an assertion fails mid-test and leaves rows behind.
	afterAll(async () => {
		await deleteUserAccount(userId).catch(() => {});
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
		await db.insert(syncBooks).values({ userId, bookId: "book1", title: "B", updatedAt: now });
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

		const usersBefore = await db.$count(user);

		// Act.
		await deleteUserAccount(userId);

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

		// Isolation: exactly one user removed, others untouched.
		const usersAfter = await db.$count(user);
		expect(usersAfter).toBe(usersBefore - 1);
	});
});
