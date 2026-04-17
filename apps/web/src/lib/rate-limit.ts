interface Bucket {
	count: number;
	resetAt: number;
}

const buckets = new Map<string, Bucket>();
let callsSinceSweep = 0;
const SWEEP_EVERY = 500;

export interface RateLimitOptions {
	max: number;
	windowMs: number;
}

export interface RateLimitResult {
	ok: boolean;
	retryAfter?: number;
}

export function checkLimit(key: string, { max, windowMs }: RateLimitOptions): RateLimitResult {
	const now = Date.now();

	if (++callsSinceSweep >= SWEEP_EVERY) {
		callsSinceSweep = 0;
		for (const [k, b] of buckets) {
			if (b.resetAt <= now) buckets.delete(k);
		}
	}

	const bucket = buckets.get(key);

	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return { ok: true };
	}

	if (bucket.count >= max) {
		return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
	}

	bucket.count += 1;
	return { ok: true };
}
