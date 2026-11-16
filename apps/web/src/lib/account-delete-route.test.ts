// @vitest-environment node
import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { deleteUserAccount } from "~/lib/account-deletion";
import { requireAuth } from "~/lib/session-middleware";
import { Route } from "~/routes/api/account/delete";

type AccountRow = { providerId: string; password: string | null; updatedAt: Date };
const accountRows = vi.hoisted(() => ({ value: [] as AccountRow[] }));

vi.mock("~/lib/session-middleware", () => ({ requireAuth: { name: "requireAuth" } }));
vi.mock("~/lib/cors-middleware", () => ({ cors: {} }));
vi.mock("~/lib/account-deletion", () => ({ deleteUserAccount: vi.fn(async () => {}) }));
vi.mock("~/db", () => ({
	db: {
		select: () => ({
			from: () => ({ where: async () => accountRows.value }),
		}),
	},
}));
vi.mock("~/lib/auth", () => ({
	auth: { $context: Promise.resolve({ password: { verify: verifyPassword } }) },
}));

type Handler = (ctx: {
	request: Request;
	context: { user: { id: string }; session: { id: string; createdAt: Date } };
}) => Promise<Response>;

const server = (
	Route.options as unknown as { server: { middleware: unknown[]; handlers: { POST: Handler } } }
).server;

const PASSWORD = "correct horse battery";
let passwordHash: string;
beforeAll(async () => {
	passwordHash = await hashPassword(PASSWORD);
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

function post(userId: string, body: unknown, sessionCreatedAt = minutesAgo(60 * 24)) {
	const request = new Request("https://lesefluss.test/api/account/delete", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return server.handlers.POST({
		request,
		context: { user: { id: userId }, session: { id: "s", createdAt: sessionCreatedAt } },
	});
}

const withPassword = () => {
	accountRows.value = [
		{ providerId: "credential", password: passwordHash, updatedAt: minutesAgo(1) },
	];
};
const oauthOnly = (lastSignIn: Date, providerId = "google") => {
	accountRows.value = [
		{ providerId: "discord", password: null, updatedAt: minutesAgo(60 * 24 * 30) },
		{ providerId, password: null, updatedAt: lastSignIn },
	];
};

describe("POST /api/account/delete", () => {
	beforeEach(() => {
		vi.mocked(deleteUserAccount).mockClear();
		withPassword();
	});

	test("runs behind the session check", () => {
		expect(server.middleware).toContain(requireAuth);
	});

	test("deletes the session's user with the right password, never one named in the body", async () => {
		const userId = `u-${randomUUID()}`;
		const res = await post(userId, {
			confirm: "delete-account",
			password: PASSWORD,
			userId: "someone-else",
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		expect(deleteUserAccount).toHaveBeenCalledExactlyOnceWith(userId);
	});

	test("answers 403 wrong_password and deletes nothing for a wrong password", async () => {
		const res = await post(`u-${randomUUID()}`, { confirm: "delete-account", password: "nope" });
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ reason: "wrong_password" });
		expect(deleteUserAccount).not.toHaveBeenCalled();
	});

	test("answers 403 password_required and deletes nothing without a password", async () => {
		const userId = `u-${randomUUID()}`;
		for (const body of [
			{ confirm: "delete-account" },
			{ confirm: "delete-account", password: "" },
		]) {
			const res = await post(userId, body, minutesAgo(1));
			expect(res.status).toBe(403);
			expect(await res.json()).toMatchObject({ reason: "password_required" });
		}
		expect(deleteUserAccount).not.toHaveBeenCalled();
	});

	test("an account without a password needs a Google or Discord sign-in from the last 10 minutes", async () => {
		oauthOnly(minutesAgo(11));
		const stale = await post(`u-${randomUUID()}`, { confirm: "delete-account" });
		expect(stale.status).toBe(403);
		expect(await stale.json()).toMatchObject({ reason: "reauth_required" });
		expect(deleteUserAccount).not.toHaveBeenCalled();

		oauthOnly(minutesAgo(2));
		const userId = `u-${randomUUID()}`;
		const fresh = await post(userId, { confirm: "delete-account" });
		expect(fresh.status).toBe(200);
		expect(deleteUserAccount).toHaveBeenCalledExactlyOnceWith(userId);
	});

	test("a brand-new session is no proof of a sign-in (the device-link flow mints one)", async () => {
		oauthOnly(minutesAgo(60));
		const res = await post(`u-${randomUUID()}`, { confirm: "delete-account" }, minutesAgo(0));
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ reason: "reauth_required" });
		expect(deleteUserAccount).not.toHaveBeenCalled();
	});

	test("a fresh OAuth row does not stand in for the password of an account that has one", async () => {
		accountRows.value = [
			{ providerId: "credential", password: passwordHash, updatedAt: minutesAgo(60) },
			{ providerId: "google", password: null, updatedAt: minutesAgo(0) },
		];
		const res = await post(`u-${randomUUID()}`, { confirm: "delete-account" });
		expect(res.status).toBe(403);
		expect(await res.json()).toMatchObject({ reason: "password_required" });
		expect(deleteUserAccount).not.toHaveBeenCalled();
	});

	test("answers 400 and deletes nothing without the confirm literal", async () => {
		const userId = `u-${randomUUID()}`;
		for (const body of [{}, { confirm: "yes", password: PASSWORD }, null]) {
			expect((await post(userId, body)).status).toBe(400);
		}
		expect(deleteUserAccount).not.toHaveBeenCalled();
	});

	test("answers 429 after three attempts a minute, wrong passwords included", async () => {
		const userId = `u-${randomUUID()}`;
		for (let i = 0; i < 3; i++)
			await post(userId, { confirm: "delete-account", password: "guess" });
		const res = await post(userId, { confirm: "delete-account", password: PASSWORD });
		expect(res.status).toBe(429);
		expect(deleteUserAccount).not.toHaveBeenCalled();
	});
});
