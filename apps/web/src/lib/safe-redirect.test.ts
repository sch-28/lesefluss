import { describe, expect, test } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

const OFF_SITE_INPUTS = [
	"/\\evil.example",
	"/\\/evil.example",
	"/\t/evil.example",
	"/\n/evil.example",
	"/\r/evil.example",
	"//evil.example",
	"///evil.example",
	"/\\\\evil.example",
	"/.//evil.example",
	"/x/..//evil.example",
	"/%2e//evil.example",
	"/.\\/evil.example",
	"/./\\evil.example",
	"/..//evil.example",
	"/%2e%2e//evil.example",
];

const ABSOLUTE_AND_RELATIVE_INPUTS = [
	"https://evil.example/",
	"javascript:alert(1)",
	"evil.example",
	"",
	" /profile",
];

const LOGIN_AND_API_VARIANTS = [
	"/LOGIN",
	"/Login?redirect=/profile",
	"/lOgIn/",
	"/API",
	"/Api/auth/sign-out",
	"/aPi",
	"/profile/../API/auth/sign-out",
	"/x/%2e%2e/LOGIN",
	"/%4Cogin",
	"/%6c%6f%67%69%6e",
	"/%41pi/auth/sign-out",
	"/log%00in",
	"/LO%0AGIN",
	"/a%09pi/auth/get-session",
	"/%4Cogin/%ZZ",
	"/%41pi/auth/get-session%ff",
];

describe("safeRedirectPath", () => {
	test("keeps same-origin paths with their query and hash", () => {
		expect(safeRedirectPath("/invite/abc123")).toBe("/invite/abc123");
		expect(safeRedirectPath("/link?code=XY12#top")).toBe("/link?code=XY12#top");
		expect(safeRedirectPath("/")).toBe("/");
	});

	test("rejects backslash, tab and newline paths the browser resolves off-site", () => {
		for (const value of OFF_SITE_INPUTS) {
			expect(safeRedirectPath(value), JSON.stringify(value)).toBeUndefined();
		}
	});

	test("rejects absolute URLs, scheme and relative values", () => {
		for (const value of ABSOLUTE_AND_RELATIVE_INPUTS) {
			expect(safeRedirectPath(value), JSON.stringify(value)).toBeUndefined();
		}
	});

	test("rejects non-strings", () => {
		expect(safeRedirectPath(undefined)).toBeUndefined();
		expect(safeRedirectPath(42)).toBeUndefined();
		expect(safeRedirectPath(["/profile"])).toBeUndefined();
	});

	test("rejects the login page and auth endpoints, also after normalising", () => {
		for (const value of [
			"/login",
			"/login?redirect=/profile",
			"/login/",
			"/api/auth/sign-out",
			"/api",
			"/profile/../api/auth/sign-out",
			"/x/%2e%2e/login",
		]) {
			expect(safeRedirectPath(value), JSON.stringify(value)).toBeUndefined();
		}
	});

	test("rejects the login page and auth endpoints in any letter case or percent-encoding", () => {
		for (const value of LOGIN_AND_API_VARIANTS) {
			expect(safeRedirectPath(value), JSON.stringify(value)).toBeUndefined();
		}
	});

	test("returns the normalised path, not the raw value", () => {
		expect(safeRedirectPath("/invite/../profile")).toBe("/profile");
		expect(safeRedirectPath("/a/./b")).toBe("/a/b");
	});

	test("keeps the extension-callback, mobile-callback and device-link shapes", () => {
		for (const value of [
			"/auth/extension-callback?redirect_uri=https%3A%2F%2Fabcdef.chromiumapp.org%2F&state=s1",
			"/auth/extension-callback?redirect_uri=https%3A%2F%2Fabcdef.chromiumapp.org%2F",
			"/auth/mobile-callback?state=abc%2Bdef",
			"/auth/mobile-callback",
			"/link?user_code=ABCD-1234",
			"/link",
		]) {
			expect(safeRedirectPath(value)).toBe(value);
		}
	});

	test("every accepted value stays on the site when the browser resolves it", () => {
		const origin = "https://lesefluss.app";
		const harmless = [
			"/profile",
			"/a/./b",
			"/invite/../link?code=1",
			"/x/%2e%2e/y",
			"/%2Fz",
			"/loginx",
			"/apis",
			"/%5Cevil.example",
			"/%2F%2Fevil.example",
			"/a/%2e%2e/%2e%2e/b",
			"/auth/extension-callback?redirect_uri=https%3A%2F%2Fevil.example%2F",
		];
		for (const value of harmless) {
			expect(safeRedirectPath(value), JSON.stringify(value)).toBeDefined();
		}
		for (const value of [
			...harmless,
			...OFF_SITE_INPUTS,
			...ABSOLUTE_AND_RELATIVE_INPUTS,
			...LOGIN_AND_API_VARIANTS,
		]) {
			const result = safeRedirectPath(value);
			if (result === undefined) continue;
			expect(new URL(result, origin).origin, JSON.stringify(value)).toBe(origin);
		}
	});
});
