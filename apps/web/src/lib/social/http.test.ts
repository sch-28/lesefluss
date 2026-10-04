import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { SocialError } from "./errors";
import { FEED_DELETE_LIMIT, FEED_READ_LIMIT } from "./feed";
import { socialAction, socialGetById, socialPost } from "./http";

const Body = z.object({ name: z.string() });

function call(
	handler: (ctx: {
		request: Request;
		context: { user: { id: string }; session: { id: string } };
	}) => Promise<Response>,
	request: Request,
	userId: string = randomUUID(),
) {
	return handler({ request, context: { user: { id: userId }, session: { id: `sess-${userId}` } } });
}

function post(body: unknown) {
	return new Request("https://lesefluss.test/api", {
		method: "POST",
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

describe("social route handlers", () => {
	test("returns the run result as JSON", async () => {
		const handler = socialPost({
			limit: { key: `t-${randomUUID()}`, max: 5, windowMs: 60_000 },
			schema: Body,
			run: async (userId, body) => ({ userId, greeting: `hi ${body.name}` }),
		});
		const res = await call(handler, post({ name: "ada" }), "u1");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ userId: "u1", greeting: "hi ada" });
	});

	test("answers { ok: true } when run returns nothing, and passes a Response through", async () => {
		const limit = { key: `t-${randomUUID()}`, max: 5, windowMs: 60_000 };
		const ok = socialAction({ limit, run: async () => {} });
		expect(await (await call(ok, post({}))).json()).toEqual({ ok: true });

		const raw = socialAction({
			limit,
			run: async () => new Response("teapot", { status: 418 }),
		});
		const res = await call(raw, post({}));
		expect(res.status).toBe(418);
		expect(await res.text()).toBe("teapot");
	});

	test("rejects a body that does not match the schema, or is not JSON, with 400", async () => {
		const handler = socialPost({
			limit: { key: `t-${randomUUID()}`, max: 5, windowMs: 60_000 },
			schema: Body,
			run: async () => {
				throw new Error("must not run");
			},
		});
		for (const body of [{ name: 1 }, "not json"]) {
			const res = await call(handler, post(body));
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "Invalid payload", reason: "invalid" });
		}
	});

	test("rejects a missing or malformed ?id= with 400", async () => {
		const seen: string[] = [];
		const handler = socialGetById({
			limit: { key: `t-${randomUUID()}`, max: 5, windowMs: 60_000 },
			run: async (_, id) => {
				seen.push(id);
			},
		});
		for (const query of ["", "?id=nope"]) {
			const res = await call(handler, new Request(`https://lesefluss.test/api${query}`));
			expect(res.status).toBe(400);
		}
		const id = randomUUID();
		expect((await call(handler, new Request(`https://lesefluss.test/api?id=${id}`))).status).toBe(
			200,
		);
		expect(seen).toEqual([id]);
	});

	test("maps a SocialError to its status and body", async () => {
		const handler = socialAction({
			limit: { key: `t-${randomUUID()}`, max: 5, windowMs: 60_000 },
			run: async () => {
				throw new SocialError("not_found");
			},
		});
		const res = await call(handler, post({}));
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ error: "not_found", reason: "not_found" });
	});

	test("rethrows anything that is not a SocialError", async () => {
		const handler = socialAction({
			limit: { key: `t-${randomUUID()}`, max: 5, windowMs: 60_000 },
			run: async () => {
				throw new Error("boom");
			},
		});
		await expect(call(handler, post({}))).rejects.toThrow("boom");
	});

	test("limits per user and answers 429 with Retry-After", async () => {
		let runs = 0;
		const handler = socialAction({
			limit: { key: `t-${randomUUID()}`, max: 2, windowMs: 60_000 },
			run: async () => {
				runs++;
			},
		});
		for (let i = 0; i < 2; i++) expect((await call(handler, post({}), "ada")).status).toBe(200);
		const limited = await call(handler, post({}), "ada");
		expect(limited.status).toBe(429);
		expect(limited.headers.get("Retry-After")).toBe("60");
		expect(await limited.json()).toEqual({ error: "Too many requests", reason: "rate_limited" });
		expect((await call(handler, post({}), "bo")).status).toBe(200);
		expect(runs).toBe(3);
	});

	test("deleting feed events does not spend the feed-reading budget", async () => {
		const read = socialAction({ limit: FEED_READ_LIMIT, run: async () => {} });
		const del = socialAction({ limit: FEED_DELETE_LIMIT, run: async () => {} });
		expect(FEED_DELETE_LIMIT.key).not.toBe(FEED_READ_LIMIT.key);
		const userId = `feed-${randomUUID()}`;
		for (let i = 0; i < FEED_DELETE_LIMIT.max; i++) await call(del, post({}), userId);
		expect((await call(del, post({}), userId)).status).toBe(429);
		expect((await call(read, post({}), userId)).status).toBe(200);
	});
});
