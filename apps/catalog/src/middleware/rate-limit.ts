import type { HttpBindings } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";

const CAPACITY = 60; // tokens per window
const WINDOW_MS = 60_000; // 1 minute
const REFILL_PER_MS = CAPACITY / WINDOW_MS;

type Bucket = { tokens: number; lastRefill: number };
const buckets = new Map<string, Bucket>();

/**
 * Resolves the client IP. Trusts X-Forwarded-For — assumes deployment behind a reverse
 * proxy (Coolify in production). If ever exposed directly, clients could spoof the header
 * to bypass rate limits.
 */
function getClientIp(c: {
	env: HttpBindings;
	req: { header: (k: string) => string | undefined };
}): string {
	const xff = c.req.header("x-forwarded-for");
	if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
	return c.env.incoming.socket.remoteAddress ?? "unknown";
}

export const rateLimit: MiddlewareHandler<{ Bindings: HttpBindings }> = async (c, next) => {
	const ip = getClientIp(c);
	const now = Date.now();
	let bucket = buckets.get(ip);
	if (!bucket) {
		bucket = { tokens: CAPACITY, lastRefill: now };
		buckets.set(ip, bucket);
	} else {
		const elapsed = now - bucket.lastRefill;
		bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_PER_MS);
		bucket.lastRefill = now;
	}

	if (bucket.tokens < 1) {
		return c.json({ error: "rate limit exceeded" }, 429);
	}
	bucket.tokens -= 1;
	await next();
};

// Periodic cleanup of idle buckets to prevent unbounded growth
setInterval(() => {
	const cutoff = Date.now() - WINDOW_MS * 5;
	for (const [ip, bucket] of buckets) {
		if (bucket.lastRefill < cutoff) buckets.delete(ip);
	}
}, WINDOW_MS).unref();
