import { afterEach, describe, expect, it, vi } from "vitest";
import {
	isAllowedCorsOrigin,
	isAllowedExtensionOrigin,
	isAllowedExtensionRedirectUri,
} from "./allowed-origins";

const chromeId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
// Firefox internal extension origin uses the addon UUID; the identity redirect
// URI host is a 40-char SHA-1 hash derived from the addon ID.
const firefoxId = "12345678-1234-1234-1234-123456789abc";
const firefoxRedirectHost = "0123456789abcdef0123456789abcdef01234567";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("extension redirect URI allowlist", () => {
	it("accepts browser-generated extension redirect URIs only", () => {
		expect(isAllowedExtensionRedirectUri(`https://${chromeId}.chromiumapp.org/`)).toBe(true);
		expect(
			isAllowedExtensionRedirectUri(`https://${firefoxRedirectHost}.extensions.allizom.org/`),
		).toBe(true);
	});

	it("rejects redirect URIs with wrong hosts or extra URL parts", () => {
		expect(isAllowedExtensionRedirectUri("https://example.chromiumapp.org/")).toBe(false);
		expect(isAllowedExtensionRedirectUri("https://bad-uuid.extensions.allizom.org/")).toBe(false);
		expect(isAllowedExtensionRedirectUri(`https://${chromeId}.evil.chromiumapp.org/`)).toBe(false);
		expect(isAllowedExtensionRedirectUri(`https://${chromeId}.chromiumapp.org/callback`)).toBe(
			false,
		);
		expect(isAllowedExtensionRedirectUri(`https://${chromeId}.chromiumapp.org/?x=1`)).toBe(false);
		expect(isAllowedExtensionRedirectUri(`https://${chromeId}.chromiumapp.org/#frag`)).toBe(false);
		expect(isAllowedExtensionRedirectUri(`http://${chromeId}.chromiumapp.org/`)).toBe(false);
	});
});

describe("extension CORS origin allowlist", () => {
	it("accepts extension origins separately from redirect URIs", () => {
		expect(isAllowedExtensionOrigin(`chrome-extension://${chromeId}`)).toBe(true);
		expect(isAllowedExtensionOrigin(`moz-extension://${firefoxId}`)).toBe(true);
		expect(isAllowedCorsOrigin(`chrome-extension://${chromeId}`)).toBe(true);
		expect(isAllowedCorsOrigin(`moz-extension://${firefoxId}`)).toBe(true);
	});

	it("does not treat redirect URI hostnames as CORS extension origins", () => {
		expect(isAllowedExtensionOrigin(`https://${chromeId}.chromiumapp.org`)).toBe(false);
		expect(isAllowedExtensionOrigin(`https://${firefoxRedirectHost}.extensions.allizom.org`)).toBe(
			false,
		);
	});

	it("rejects malformed extension origins", () => {
		expect(isAllowedCorsOrigin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaz")).toBe(false);
		expect(isAllowedCorsOrigin("moz-extension://bad-uuid")).toBe(false);
	});

	it("requires configured extension IDs in production", () => {
		vi.stubEnv("NODE_ENV", "production");
		expect(isAllowedCorsOrigin(`chrome-extension://${chromeId}`)).toBe(false);
		vi.stubEnv("LESEFLUSS_CHROME_EXTENSION_IDS", chromeId);
		expect(isAllowedCorsOrigin(`chrome-extension://${chromeId}`)).toBe(true);
	});
});

describe("production extension redirect URI allowlist", () => {
	it("requires configured extension IDs in production", () => {
		vi.stubEnv("NODE_ENV", "production");
		expect(isAllowedExtensionRedirectUri(`https://${chromeId}.chromiumapp.org/`)).toBe(false);
		vi.stubEnv("LESEFLUSS_CHROME_EXTENSION_IDS", chromeId);
		expect(isAllowedExtensionRedirectUri(`https://${chromeId}.chromiumapp.org/`)).toBe(true);
	});
});
