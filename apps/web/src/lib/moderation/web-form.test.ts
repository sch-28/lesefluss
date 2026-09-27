import { WebNoticeBodySchema } from "@lesefluss/core";
import { describe, expect, test } from "vitest";
import { readBodyCapped } from "~/lib/public-form";
import { fieldErrors } from "./web-form";

function request(body: string): Request {
	return new Request("https://lesefluss.test/api/report", { method: "POST", body });
}

describe("readBodyCapped", () => {
	test("returns the text of a body under the cap", async () => {
		expect(await readBodyCapped(request('{"a":1}'), 100)).toBe('{"a":1}');
	});

	test("rejects a body over the cap even without a content-length header", async () => {
		expect(await readBodyCapped(request("x".repeat(101)), 100)).toBeNull();
	});
});

describe("fieldErrors", () => {
	test("maps every invalid field of the web form to one message", () => {
		const result = WebNoticeBodySchema.safeParse({
			targetType: "profile",
			location: "",
			reason: "spam",
			text: "short",
			name: "",
			email: "nope",
			goodFaith: false,
		});
		if (result.success) throw new Error("expected failure");
		const errors = fieldErrors(result.error.issues);
		expect(Object.keys(errors).sort()).toEqual(["email", "goodFaith", "location", "name", "text"]);
		expect(errors.goodFaith).toContain("good faith");
		expect(errors.text).toContain("10 characters");
	});

	test("keeps the first message per field and falls back to the issue text", () => {
		expect(
			fieldErrors([
				{ path: ["odd"], message: "first" },
				{ path: ["odd"], message: "second" },
				{ path: [], message: "whole form" },
			]),
		).toEqual({ odd: "first", form: "whole form" });
	});
});
