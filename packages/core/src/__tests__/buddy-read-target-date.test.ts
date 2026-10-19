import { describe, expect, test } from "vitest";
import { BuddyReadTargetDateBodySchema } from "../social";

const DAY = 86_400_000;
const body = (targetDate: number | null) => ({
	buddyReadId: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
	targetDate,
});

describe("BuddyReadTargetDateBodySchema", () => {
	test("accepts a clear, yesterday's end and dates up to five years out", () => {
		for (const at of [
			null,
			Date.now() - DAY / 2,
			Date.now() + 30 * DAY,
			Date.now() + 5 * 365 * DAY,
		]) {
			expect(BuddyReadTargetDateBodySchema.safeParse(body(at)).success).toBe(true);
		}
	});

	test("rejects dates long past or absurdly far away instead of failing later", () => {
		for (const at of [0, Date.now() - 3 * DAY, Date.now() + 6 * 366 * DAY, 8.7e15]) {
			expect(BuddyReadTargetDateBodySchema.safeParse(body(at)).success).toBe(false);
		}
	});
});
