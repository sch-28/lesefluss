import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { env } from "../env.js";

function secretsMatch(received: string, expected: string): boolean {
	const a = Buffer.from(received);
	const b = Buffer.from(expected);
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

export const requireAdmin: MiddlewareHandler = async (c, next) => {
	const expected = env.CATALOG_ADMIN_SECRET;
	if (!expected) return c.json({ error: "admin secret not configured" }, 503);
	const header = c.req.header("authorization");
	if (!header?.startsWith("Bearer ")) return c.json({ error: "unauthorized" }, 401);
	const token = header.slice("Bearer ".length).trim();
	if (!secretsMatch(token, expected)) return c.json({ error: "unauthorized" }, 401);
	await next();
};
