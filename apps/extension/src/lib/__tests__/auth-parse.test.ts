import { describe, expect, it } from "vitest";
import { parseAuthCallback } from "../auth-parse";

const REDIRECT = "https://abcd.chromiumapp.org/";

describe("parseAuthCallback", () => {
	it("extracts token and state from the URL fragment", () => {
		const callback = `${REDIRECT}#token=abc.def&state=nonce-123`;
		expect(parseAuthCallback(callback, REDIRECT)).toEqual({ token: "abc.def", state: "nonce-123" });
	});

	it("accepts a missing state but requires a token", () => {
		expect(parseAuthCallback(`${REDIRECT}#token=t1`, REDIRECT)).toEqual({
			token: "t1",
			state: null,
		});
	});

	it("throws when the token is missing", () => {
		expect(() => parseAuthCallback(`${REDIRECT}#state=x`, REDIRECT)).toThrow(/session token/);
	});

	it("rejects a callback that lands on a different origin", () => {
		expect(() => parseAuthCallback("https://evil.example/#token=t", REDIRECT)).toThrow(
			/unexpected redirect/,
		);
	});

	it("rejects a callback whose path differs from the expected redirect", () => {
		expect(() => parseAuthCallback(`${REDIRECT}other#token=t`, REDIRECT)).toThrow(
			/unexpected redirect/,
		);
	});

	it("rejects a callback that adds a query string the original redirect did not have", () => {
		expect(() => parseAuthCallback(`${REDIRECT}?injected=1#token=t`, REDIRECT)).toThrow(
			/unexpected redirect/,
		);
	});
});
