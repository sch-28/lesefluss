// @vitest-environment node
//
// Push token lifecycle against a real Postgres database. Skipped when
// DATABASE_URL is unset.
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

// `~/lib/auth` reads these at import time; none of them is exercised here.
process.env.BETTER_AUTH_SECRET ??= "test-secret";
process.env.BETTER_AUTH_URL ??= "https://lesefluss.test";
process.env.GOOGLE_CLIENT_ID ??= "test";
process.env.GOOGLE_CLIENT_SECRET ??= "test";
process.env.DISCORD_CLIENT_ID ??= "test";
process.env.DISCORD_CLIENT_SECRET ??= "test";
process.env.RESEND_API_KEY ??= "test";

describe.skipIf(!hasDb)("push tokens (integration)", async () => {
	const { auth } = await import("~/lib/auth");
	const { db } = await import("~/db");
	const { session, user } = await import("~/db/auth-schema");
	const { socialPushToken } = await import("~/db/schema");
	const { registerPushToken } = await import("./tokens");

	const run = randomUUID().slice(0, 8);
	const alice = `test-push-a-${run}`;
	const bob = `test-push-b-${run}`;
	const sessionOf = (userId: string) => `sess-${userId}`;
	const bearerOf = (userId: string) => `tok-${userId}`;

	const tokenRow = async (token: string) =>
		(await db.select().from(socialPushToken).where(eq(socialPushToken.token, token)))[0];

	beforeAll(async () => {
		const now = new Date();
		for (const id of [alice, bob]) {
			await db.insert(user).values({
				id,
				name: id,
				email: `${id}@example.com`,
				emailVerified: true,
				createdAt: now,
				updatedAt: now,
			});
			await db.insert(session).values({
				id: sessionOf(id),
				token: bearerOf(id),
				userId: id,
				expiresAt: new Date(now.getTime() + 60 * 60_000),
				updatedAt: now,
			});
		}
	});

	afterAll(async () => {
		await db.delete(user).where(inArray(user.id, [alice, bob]));
	});

	test("a second account on the same device takes the token over", async () => {
		const token = `fcm-shared-${run}`;
		await registerPushToken({
			token,
			platform: "android",
			userId: alice,
			sessionId: sessionOf(alice),
		});
		await registerPushToken({ token, platform: "android", userId: bob, sessionId: sessionOf(bob) });

		const row = await tokenRow(token);
		expect(row?.userId).toBe(bob);
		expect(row?.sessionId).toBe(sessionOf(bob));
	});

	test("a rotated token replaces the session's earlier one", async () => {
		const first = `fcm-rotate-1-${run}`;
		const second = `fcm-rotate-2-${run}`;
		await registerPushToken({
			token: first,
			platform: "android",
			userId: alice,
			sessionId: sessionOf(alice),
		});
		await registerPushToken({
			token: second,
			platform: "android",
			userId: alice,
			sessionId: sessionOf(alice),
		});

		expect(await tokenRow(first)).toBeUndefined();
		expect((await tokenRow(second))?.userId).toBe(alice);
	});

	test("signing out removes the device's token", async () => {
		const token = `fcm-signout-${run}`;
		await registerPushToken({
			token,
			platform: "android",
			userId: alice,
			sessionId: sessionOf(alice),
		});

		await auth.api.signOut({
			headers: new Headers({ authorization: `Bearer ${bearerOf(alice)}` }),
		});

		expect(await tokenRow(token)).toBeUndefined();
	});

	test("deleting the account removes its tokens", async () => {
		const token = `fcm-delete-${run}`;
		await registerPushToken({ token, platform: "android", userId: bob, sessionId: sessionOf(bob) });

		await db.delete(user).where(eq(user.id, bob));

		expect(await tokenRow(token)).toBeUndefined();
	});
});
