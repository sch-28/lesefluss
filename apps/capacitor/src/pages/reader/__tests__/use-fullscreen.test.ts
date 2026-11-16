import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ isNative: false }));
vi.mock("@capacitor/core", () => ({
	Capacitor: { isNativePlatform: () => platform.isNative },
}));

const { isFullscreenSupported } = await import("../use-fullscreen");
const { readerActionCommands } = await import("../commands");

function fullscreenInput() {
	return isFullscreenSupported() ? { isOn: false, toggle: vi.fn(), exit: vi.fn() } : null;
}

function commandIds() {
	return readerActionCommands({
		hasContent: true,
		readerMode: "standard",
		paginationStyle: "scroll",
		canChangeLayout: true,
		setPaginationStyle: vi.fn(),
		openSearch: vi.fn(),
		openAppearance: vi.fn(),
		openAnnotations: vi.fn(),
		readAloud: null,
		chapters: [],
		goToWord: vi.fn(),
		bookmarks: { isOnScreen: false, toggle: vi.fn(), goToNext: vi.fn(), list: [] },
		openBookDetails: vi.fn(),
		fullscreen: fullscreenInput(),
		openMini: null,
	}).map((c) => c.id);
}

describe("fullscreen availability", () => {
	beforeEach(() => {
		Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
	});
	afterEach(() => {
		platform.isNative = false;
	});

	it("is offered in the web build, as the F command and in the palette", () => {
		expect(isFullscreenSupported()).toBe(true);
		expect(commandIds()).toContain("reader.fullscreen");
	});

	it("is not offered in the Android app, even where the WebView has the API", () => {
		platform.isNative = true;
		expect(isFullscreenSupported()).toBe(false);
		expect(commandIds()).not.toContain("reader.fullscreen");
		expect(commandIds()).not.toContain("reader.fullscreen-exit");
	});

	it("is not offered where the browser refuses fullscreen", () => {
		Object.defineProperty(document, "fullscreenEnabled", { value: false, configurable: true });
		expect(isFullscreenSupported()).toBe(false);
	});
});
