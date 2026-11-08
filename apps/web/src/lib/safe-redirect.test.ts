import { describe, expect, test } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
	test("keeps same-origin paths with their query and hash", () => {
		expect(safeRedirectPath("/invite/abc123")).toBe("/invite/abc123");
		expect(safeRedirectPath("/link?code=XY12#top")).toBe("/link?code=XY12#top");
		expect(safeRedirectPath("/")).toBe("/");
	});

	test("rejects backslash, tab and newline paths the browser resolves off-site", () => {
		for (const value of [
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
		]) {
			expect(safeRedirectPath(value), JSON.stringify(value)).toBeUndefined();
		}
	});

	test("rejects absolute URLs, scheme and relative values", () => {
		for (const value of [
			"https://evil.example/",
			"javascript:alert(1)",
			"evil.example",
			"",
			" /profile",
		]) {
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

	test("returns the normalised path, not the raw value", () => {
		expect(safeRedirectPath("/invite/../profile")).toBe("/profile");
		expect(safeRedirectPath("/a/./b")).toBe("/a/b");
	});

	test("every accepted value stays on the site when the browser resolves it", () => {
		const origin = "https://lesefluss.app";
		for (const value of ["/profile", "/a/./b", "/invite/../link?code=1", "/x/%2e%2e/y", "/%2Fz"]) {
			const result = safeRedirectPath(value);
			expect(result, JSON.stringify(value)).toBeDefined();
			expect(new URL(result as string, origin).origin, JSON.stringify(value)).toBe(origin);
		}
	});
});
