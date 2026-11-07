import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

const { isMiniAvailableIn, miniPopupUrl } = await import("../open-mini");
const { isMiniPopupPath } = await import("../mini-popup");

describe("mini window availability", () => {
	it("is hidden in the native app, whatever the WebView offers", () => {
		expect(isMiniAvailableIn({ isNative: true, hasPip: true, hasChannel: true })).toBe(false);
	});

	it("is hidden where no window can open", () => {
		expect(isMiniAvailableIn({ isNative: false, hasPip: false, hasChannel: false })).toBe(false);
	});

	it("is shown on the web with either tier", () => {
		expect(isMiniAvailableIn({ isNative: false, hasPip: true, hasChannel: false })).toBe(true);
		expect(isMiniAvailableIn({ isNative: false, hasPip: false, hasChannel: true })).toBe(true);
	});
});

describe("mini popup path", () => {
	it("opens under the app's base and boots only there", () => {
		expect(miniPopupUrl("/app/", "a b")).toBe("/app/mini?s=a%20b");
		expect(miniPopupUrl("/", "x")).toBe("/mini?s=x");
		expect(isMiniPopupPath("/app/mini", "/app/")).toBe(true);
		expect(isMiniPopupPath("/app/mini/", "/app/")).toBe(true);
		expect(isMiniPopupPath("/mini", "/")).toBe(true);
		expect(isMiniPopupPath("/app/tabs/library/mini", "/app/")).toBe(false);
		expect(isMiniPopupPath("/app/tabs/reader/x", "/app/")).toBe(false);
	});
});
