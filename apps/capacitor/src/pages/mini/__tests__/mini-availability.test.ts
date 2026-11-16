import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

const { isMiniAvailable, isMiniAvailableIn, miniPopupUrl } = await import("../open-mini");
const { isMobileBrowser } = await import("../../../utils/mobile-browser");
const { isMiniPopupPath } = await import("../mini-popup");

const desktop = { isNative: false, isMobile: false };

describe("mini window availability", () => {
	it("is hidden in the native app, whatever the WebView offers", () => {
		expect(
			isMiniAvailableIn({ isNative: true, isMobile: true, hasPip: true, hasChannel: true }),
		).toBe(false);
	});

	it("is hidden on mobile web, where the popup opens as a full tab", () => {
		expect(
			isMiniAvailableIn({ isNative: false, isMobile: true, hasPip: true, hasChannel: true }),
		).toBe(false);
	});

	it("is hidden where no window can open", () => {
		expect(isMiniAvailableIn({ ...desktop, hasPip: false, hasChannel: false })).toBe(false);
	});

	it("is shown on desktop web with either tier", () => {
		expect(isMiniAvailableIn({ ...desktop, hasPip: true, hasChannel: false })).toBe(true);
		expect(isMiniAvailableIn({ ...desktop, hasPip: false, hasChannel: true })).toBe(true);
	});
});

describe("mini window availability in this browser", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("reads the real navigator: hidden on a phone, shown on a desktop", () => {
		expect(typeof BroadcastChannel).toBe("function");
		const userAgent = vi.spyOn(navigator, "userAgent", "get");
		userAgent.mockReturnValue(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
		);
		expect(isMiniAvailable()).toBe(false);
		userAgent.mockReturnValue("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0");
		expect(isMiniAvailable()).toBe(true);
	});
});

describe("mobile browser check", () => {
	const ua = {
		androidPhone:
			"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
		androidTablet:
			"Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
		iphone:
			"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
		mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
		linux:
			"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
		windows:
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
	};

	it("counts phones and tablets as mobile", () => {
		expect(
			isMobileBrowser({
				isPrimaryPointerCoarse: false,
				userAgent: ua.androidPhone,
				platform: "Linux armv8l",
				maxTouchPoints: 5,
			}),
		).toBe(true);
		expect(
			isMobileBrowser({
				isPrimaryPointerCoarse: false,
				userAgent: ua.androidTablet,
				platform: "Linux armv8l",
				maxTouchPoints: 5,
			}),
		).toBe(true);
		expect(
			isMobileBrowser({
				isPrimaryPointerCoarse: false,
				userAgent: ua.iphone,
				platform: "iPhone",
				maxTouchPoints: 5,
			}),
		).toBe(true);
	});

	it("counts an iPad that reports itself as a Mac as mobile", () => {
		expect(
			isMobileBrowser({
				isPrimaryPointerCoarse: false,
				userAgent: ua.mac,
				platform: "MacIntel",
				maxTouchPoints: 5,
			}),
		).toBe(true);
	});

	it("counts a tablet that requests the desktop site as mobile by its touch-first pointer", () => {
		expect(
			isMobileBrowser({
				userAgent: ua.linux,
				platform: "Linux x86_64",
				maxTouchPoints: 5,
				isPrimaryPointerCoarse: true,
			}),
		).toBe(true);
	});

	it("trusts the browser's own mobile hint", () => {
		expect(
			isMobileBrowser({
				isPrimaryPointerCoarse: false,
				userAgent: ua.linux,
				platform: "Linux x86_64",
				maxTouchPoints: 0,
				uaDataMobile: true,
			}),
		).toBe(true);
	});

	it("keeps desktops, touchscreen laptops included, as desktop", () => {
		expect(
			isMobileBrowser({
				isPrimaryPointerCoarse: false,
				userAgent: ua.mac,
				platform: "MacIntel",
				maxTouchPoints: 0,
			}),
		).toBe(false);
		expect(
			isMobileBrowser({
				isPrimaryPointerCoarse: false,
				userAgent: ua.linux,
				platform: "Linux x86_64",
				maxTouchPoints: 0,
			}),
		).toBe(false);
		expect(
			isMobileBrowser({
				isPrimaryPointerCoarse: false,
				userAgent: ua.windows,
				platform: "Win32",
				maxTouchPoints: 10,
				uaDataMobile: false,
			}),
		).toBe(false);
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
