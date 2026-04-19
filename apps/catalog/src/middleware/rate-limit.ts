import type { HttpBindings } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";

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

type Bucket = { tokens: number; lastRefill: number };

export type RateLimitOptions = {
	/** Maximum requests in a single window. */
	capacity: number;
	/** Window length in milliseconds. */
	windowMs: number;
	/** Namespace suffix so independent limits use independent buckets. */
	keyPrefix?: string;
};

/**
 * Create a rate-limit middleware backed by an isolated in-memory token bucket.
 * Use separate instances for endpoints with different cost profiles (e.g. the
 * JSON API vs. multi-megabyte EPUB downloads).
 */
export function createRateLimit(opts: RateLimitOptions): MiddlewareHandler<{
	Bindings: HttpBindings;
}> {
	const { capacity, windowMs, keyPrefix = "" } = opts;
	const refillPerMs = capacity / windowMs;
	const buckets = new Map<string, Bucket>();

	setInterval(() => {
		const cutoff = Date.now() - windowMs * 5;
		for (const [ip, bucket] of buckets) {
			if (bucket.lastRefill < cutoff) buckets.delete(ip);
		}
	}, windowMs).unref();

	return async (c, next) => {
		const key = `${keyPrefix}${getClientIp(c)}`;
		const now = Date.now();
		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = { tokens: capacity, lastRefill: now };
			buckets.set(key, bucket);
		} else {
			const elapsed = now - bucket.lastRefill;
			bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
			bucket.lastRefill = now;
		}

		if (bucket.tokens < 1) {
			return c.json({ error: "rate limit exceeded" }, 429);
		}
		bucket.tokens -= 1;
		await next();
	};
}

/** Default API rate limit: 60 requests / minute / IP. */
export const rateLimit = createRateLimit({ capacity: 60, windowMs: 60_000 });

/**
 * Stricter bucket for the EPUB download proxy. Each response is ~0.5–5 MB, so a
 * looser limit would let a single IP trivially saturate bandwidth.
 */
export const epubRateLimit = createRateLimit({
	capacity: 10,
	windowMs: 60_000,
	keyPrefix: "epub:",
});

/**
 * Generous bucket for the cover image proxy. A single Explore page or marquee
 * hero easily triggers 20–30 cover requests at once, so the default 60/min API
 * bucket would 429 on first paint. Covers are tiny and aggressively cached
 * upstream, so a higher cap is safe.
 */
export const coversRateLimit = createRateLimit({
	capacity: 300,
	windowMs: 60_000,
	keyPrefix: "covers:",
});
