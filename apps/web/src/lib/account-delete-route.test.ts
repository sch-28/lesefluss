// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { deleteUserAccount } from "~/lib/account-deletion";
import { requireAuth } from "~/lib/session-middleware";
import { Route } from "~/routes/api/account/delete";

vi.mock("~/lib/session-middleware", () => ({ requireAuth: { name: "requireAuth" } }));
vi.mock("~/lib/cors-middleware", () => ({ cors: {} }));
vi.mock("~/lib/account-deletion", () => ({ deleteUserAccount: vi.fn(async () => {}) }));

type Handler = (ctx: {
	request: Request;
	context: { user: { id: string }; session: { id: string } };
}) => Promise<Response>;

const server = (
	Route.options as unknown as { server: { middleware: unknown[]; handlers: { POST: Handler } } }
).server;

function post(userId: string, body: unknown) {
	const request = new Request("https://lesefluss.test/api/account/delete", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return server.handlers.POST({ request, context: { user: { id: userId }, session: { id: "s" } } });
}

describe("POST /api/account/delete", () => {
	beforeEach(() => vi.mocked(deleteUserAccount).mockClear());

	test("runs behind the session check", () => {
		expect(server.middleware).toContain(requireAuth);
	});

	test("deletes the session's user, never one named in the body", async () => {
		const userId = `u-${randomUUID()}`;
		const res = await post(userId, { confirm: "delete-account", userId: "someone-else" });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		expect(deleteUserAccount).toHaveBeenCalledExactlyOnceWith(userId);
	});

	test("answers 400 and deletes nothing without the confirm literal", async () => {
		const userId = `u-${randomUUID()}`;
		for (const body of [{}, { confirm: "yes" }, null]) {
			expect((await post(userId, body)).status).toBe(400);
		}
		expect(deleteUserAccount).not.toHaveBeenCalled();
	});

	test("answers 429 after three attempts a minute", async () => {
		const userId = `u-${randomUUID()}`;
		for (let i = 0; i < 3; i++) await post(userId, { confirm: "delete-account" });
		expect((await post(userId, { confirm: "delete-account" })).status).toBe(429);
		expect(deleteUserAccount).toHaveBeenCalledTimes(3);
	});
});
