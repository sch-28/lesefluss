import { describe, expect, test } from "vitest";
import { ReportBodySchema, WebNoticeBodySchema } from "../social";

const valid = {
	targetType: "profile",
	location: "@booklover",
	reason: "copyright",
	text: "This profile distributes my book without permission.",
	name: "Jane Rightsholder",
	email: "Jane@Example.test",
	goodFaith: true,
};

describe("web notice body", () => {
	test("accepts a complete notice and normalises the email", () => {
		const parsed = WebNoticeBodySchema.parse(valid);
		expect(parsed.email).toBe("jane@example.test");
	});

	test.each([
		["goodFaith", { goodFaith: false }],
		["email", { email: "not-an-email" }],
		["name", { name: "" }],
		["location", { location: "" }],
		["text", { text: "short" }],
		["text", { text: "x".repeat(2001) }],
		["reason", { reason: "vibes" }],
	])("rejects a notice with an invalid %s", (field, patch) => {
		const result = WebNoticeBodySchema.safeParse({ ...valid, ...patch });
		expect(result.success).toBe(false);
		if (!result.success) expect(result.error.issues.map((i) => i.path[0])).toContain(field);
	});
});

describe("in-app report body", () => {
	test("needs a target user, a reason and enough text", () => {
		expect(
			ReportBodySchema.safeParse({
				targetType: "profile",
				targetUserId: "u1",
				reason: "spam",
				text: "Sends the same link over and over.",
			}).success,
		).toBe(true);
		expect(
			ReportBodySchema.safeParse({
				targetType: "profile",
				targetUserId: "u1",
				reason: "spam",
				text: "meh",
			}).success,
		).toBe(false);
	});
});
