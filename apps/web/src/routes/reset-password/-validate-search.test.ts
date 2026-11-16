import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/auth-client", () => ({ authClient: {} }));

const { validateResetSearch } = await import("./index");

describe("validateResetSearch", () => {
	it("reads the token the mail's link carries", () => {
		expect(validateResetSearch({ token: "abc" })).toEqual({ token: "abc", error: undefined });
	});

	it("reads an expired link's error and ignores an empty or non-string token", () => {
		expect(validateResetSearch({ token: "", error: "INVALID_TOKEN" })).toEqual({
			token: undefined,
			error: "INVALID_TOKEN",
		});
		expect(validateResetSearch({ token: 42 })).toEqual({ token: undefined, error: undefined });
	});
});
