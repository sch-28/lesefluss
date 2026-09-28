import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { rateLimited } from "~/lib/social/http";
import { checkLimit } from "./rate-limit";

const limit = { max: 2, windowMs: 10_000 };

describe("checkLimit", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	test("allows max calls per window, then refuses until the window ends", () => {
		const key = randomUUID();
		expect(checkLimit(key, limit)).toEqual({ ok: true });
		expect(checkLimit(key, limit)).toEqual({ ok: true });
		expect(checkLimit(key, limit)).toEqual({ ok: false, retryAfter: 10 });
		vi.advanceTimersByTime(7_500);
		expect(checkLimit(key, limit)).toEqual({ ok: false, retryAfter: 3 });
		vi.advanceTimersByTime(2_500);
		expect(checkLimit(key, limit)).toEqual({ ok: true });
	});

	test("keys are counted separately", () => {
		const a = randomUUID();
		checkLimit(a, limit);
		checkLimit(a, limit);
		expect(checkLimit(a, limit).ok).toBe(false);
		expect(checkLimit(randomUUID(), limit).ok).toBe(true);
	});
});

describe("rateLimited", () => {
	test("returns null while allowed, then a 429 with Retry-After", async () => {
		const key = randomUUID();
		expect(rateLimited(key, limit)).toBeNull();
		expect(rateLimited(key, limit)).toBeNull();
		const res = rateLimited(key, limit);
		expect(res?.status).toBe(429);
		expect(res?.headers.get("Retry-After")).toBe("10");
		expect(await res?.json()).toMatchObject({ reason: "rate_limited" });
	});
});
