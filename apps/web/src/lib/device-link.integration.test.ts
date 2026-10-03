// @vitest-environment node
//
// Device-link flow against a real Postgres database through better-auth's
// own endpoints. Skipped when DATABASE_URL is unset. Run locally against a
// migrated database, e.g.:
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/rsvp pnpm test device-link
import { randomUUID } from "node:crypto";
import {
	DEVICE_LINK_CLIENT_ID,
	DEVICE_LINK_GRANT_TYPE,
	formatDeviceLinkCode,
} from "@lesefluss/core";
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

describe.skipIf(!hasDb)("device link flow", async () => {
	const { auth } = await import("./auth");
	const { db } = await import("~/db");
	const { deviceCode, session, user } = await import("~/db/auth-schema");

	const run = randomUUID().slice(0, 8);
	const userId = `test-dl-${run}`;
	const sessionToken = `tok-dl-${run}`;
	const asUser = new Headers({ authorization: `Bearer ${sessionToken}` });

	// Grants nobody approves have no user_id, so deleting the user misses them.
	const issuedDeviceCodes: string[] = [];
	const issue = async () => {
		const grant = await auth.api.deviceCode({ body: { client_id: DEVICE_LINK_CLIENT_ID } });
		issuedDeviceCodes.push(grant.device_code);
		return grant;
	};
	const poll = (device_code: string) =>
		auth.api.deviceToken({
			body: { grant_type: DEVICE_LINK_GRANT_TYPE, device_code, client_id: DEVICE_LINK_CLIENT_ID },
		});
	// The plugin refuses polls faster than its interval; tests do not wait it out.
	const forgetLastPoll = (device_code: string) =>
		db
			.update(deviceCode)
			.set({ lastPolledAt: new Date(Date.now() - 60_000) })
			.where(eq(deviceCode.deviceCode, device_code));

	beforeAll(async () => {
		const now = new Date();
		await db.insert(user).values({
			id: userId,
			name: "Device Link",
			email: `${userId}@example.com`,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(session).values({
			id: `sess-${userId}`,
			token: sessionToken,
			userId,
			expiresAt: new Date(now.getTime() + 60 * 60_000),
			updatedAt: now,
		});
	});

	afterAll(async () => {
		if (issuedDeviceCodes.length > 0) {
			await db.delete(deviceCode).where(inArray(deviceCode.deviceCode, issuedDeviceCodes));
		}
		await db.delete(user).where(eq(user.id, userId));
	});

	test("issues a readable code and a link that carries it", async () => {
		const grant = await issue();
		expect(grant.user_code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
		expect(grant.device_code).toHaveLength(40);
		expect(grant.verification_uri_complete).toBe(
			`${process.env.BETTER_AUTH_URL}/link?user_code=${grant.user_code}`,
		);
		expect(grant.interval).toBe(3);
		expect(grant.expires_in).toBe(600);
	});

	test("rejects any other client", async () => {
		await expect(
			auth.api.deviceCode({ body: { client_id: "someone-else" } }),
		).rejects.toMatchObject({ body: { error: "invalid_client" } });
	});

	test("approve needs a session, then the app gets a working session exactly once", async () => {
		const grant = await issue();

		await expect(poll(grant.device_code)).rejects.toMatchObject({
			body: { error: "authorization_pending" },
		});
		await expect(
			auth.api.deviceApprove({ body: { userCode: grant.user_code }, headers: new Headers() }),
		).rejects.toMatchObject({ body: { error: "unauthorized" } });

		await expect(
			auth.api.deviceApprove({
				body: { userCode: formatDeviceLinkCode(grant.user_code) },
				headers: asUser,
			}),
		).resolves.toEqual({ success: true });

		await expect(
			auth.api.deviceApprove({ body: { userCode: grant.user_code }, headers: asUser }),
		).rejects.toMatchObject({ body: { error: "invalid_request" } });

		await forgetLastPoll(grant.device_code);
		const issued = await poll(grant.device_code);
		expect(issued.token_type).toBe("Bearer");
		const resolved = await auth.api.getSession({
			headers: new Headers({ authorization: `Bearer ${issued.access_token}` }),
		});
		expect(resolved?.user.id).toBe(userId);

		await expect(poll(grant.device_code)).rejects.toMatchObject({
			body: { error: "invalid_grant" },
		});
	});

	test("a denied code never yields a session", async () => {
		const grant = await issue();
		await expect(
			auth.api.deviceDeny({ body: { userCode: grant.user_code }, headers: asUser }),
		).resolves.toEqual({ success: true });
		await expect(poll(grant.device_code)).rejects.toMatchObject({
			body: { error: "access_denied" },
		});
	});

	test("an expired code cannot be approved or redeemed", async () => {
		const grant = await issue();
		await db
			.update(deviceCode)
			.set({ expiresAt: new Date(Date.now() - 1_000) })
			.where(eq(deviceCode.deviceCode, grant.device_code));
		await expect(
			auth.api.deviceApprove({ body: { userCode: grant.user_code }, headers: asUser }),
		).rejects.toMatchObject({ body: { error: "expired_token" } });
		await expect(poll(grant.device_code)).rejects.toMatchObject({
			body: { error: "expired_token" },
		});
	});

	test("a code nobody issued is rejected", async () => {
		await expect(
			auth.api.deviceApprove({ body: { userCode: "ZZZZ9999" }, headers: asUser }),
		).rejects.toMatchObject({ body: { error: "invalid_request" } });
		await expect(poll("not-a-device-code")).rejects.toMatchObject({
			body: { error: "invalid_grant" },
		});
	});
});
