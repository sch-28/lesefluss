import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ IS_WEB: true, standalone: false }));
vi.mock("../platform", () => ({
	get IS_WEB() {
		return platform.IS_WEB;
	},
	isStandalone: () => platform.standalone,
}));
const browserOpen = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@capacitor/browser", () => ({ Browser: { open: browserOpen } }));

import { openLink } from "../open-link";

describe("openLink", () => {
	let windowOpen: ReturnType<typeof vi.spyOn>;
	let assign: ReturnType<typeof vi.fn>;
	const realLocation = window.location;

	beforeEach(() => {
		windowOpen = vi.spyOn(window, "open").mockReturnValue(null);
		assign = vi.fn();
		Object.defineProperty(window, "location", {
			configurable: true,
			value: {
				href: "https://lesefluss.app/app/tabs/settings",
				origin: "https://lesefluss.app",
				assign,
			},
		});
		browserOpen.mockClear();
	});

	afterEach(() => {
		windowOpen.mockRestore();
		Object.defineProperty(window, "location", { configurable: true, value: realLocation });
		platform.IS_WEB = true;
		platform.standalone = false;
	});

	describe("in the installed web app", () => {
		beforeEach(() => {
			platform.standalone = true;
		});

		it("keeps a Lesefluss page inside the app window", () => {
			openLink("/feedback?source=web-app");
			expect(assign).toHaveBeenCalledWith("/feedback?source=web-app");
			expect(windowOpen).not.toHaveBeenCalled();
		});

		it("treats an absolute URL on the app's own origin as a Lesefluss page", () => {
			openLink("https://lesefluss.app/privacy");
			expect(assign).toHaveBeenCalledWith("https://lesefluss.app/privacy");
		});

		it("hands another site to the browser", () => {
			openLink("https://en.wiktionary.org/wiki/word");
			expect(windowOpen).toHaveBeenCalledWith(
				"https://en.wiktionary.org/wiki/word",
				"_blank",
				"noopener",
			);
			expect(assign).not.toHaveBeenCalled();
		});

		it("does not read a lookalike host as its own origin", () => {
			openLink("https://lesefluss.app.evil.test/");
			expect(assign).not.toHaveBeenCalled();
			expect(windowOpen).toHaveBeenCalled();
		});
	});

	describe("in a browser tab", () => {
		it("opens every link in a new tab, the app stays open", () => {
			openLink("/feedback");
			openLink("https://example.com/");
			expect(assign).not.toHaveBeenCalled();
			expect(windowOpen).toHaveBeenNthCalledWith(1, "/feedback", "_blank", "noopener");
			expect(windowOpen).toHaveBeenNthCalledWith(2, "https://example.com/", "_blank", "noopener");
		});
	});

	describe("on Android", () => {
		beforeEach(() => {
			platform.IS_WEB = false;
		});

		it("opens external links in the in-app browser as before", () => {
			openLink("https://example.com/");
			expect(browserOpen).toHaveBeenCalledWith({ url: "https://example.com/" });
			expect(windowOpen).not.toHaveBeenCalled();
		});

		it("opens the system browser when asked", () => {
			openLink("https://lesefluss.app/feedback", { nativeTarget: "system" });
			expect(windowOpen).toHaveBeenCalledWith("https://lesefluss.app/feedback", "_system");
			expect(browserOpen).not.toHaveBeenCalled();
		});
	});
});
