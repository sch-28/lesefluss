import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
const themeScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? "";

function runThemeScript(theme: string | null) {
	document.documentElement.className = "";
	document.head.innerHTML = `<meta name="theme-color" content="#fdfcfb"><style>${style}</style>`;
	localStorage.clear();
	if (theme) localStorage.setItem("app-theme", theme);
	vi.stubGlobal(
		"matchMedia",
		vi.fn(() => ({ matches: false, addEventListener: () => {} })),
	);
	new Function(themeScript)();
	return document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content;
}

function computedBackgroundFor(className: string) {
	document.documentElement.className = className;
	return getComputedStyle(document.documentElement).backgroundColor;
}

describe("index.html theme-color", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		document.documentElement.className = "";
		localStorage.clear();
	});

	it("paints the installed app's title bar in the saved dark background", () => {
		const content = runThemeScript("dark");
		expect(content).toBe(computedBackgroundFor("dark"));
		expect(content).toMatch(/^rgb|^#/);
		expect(content).not.toBe(computedBackgroundFor(""));
	});

	it("paints it in the sepia background for the sepia theme", () => {
		expect(runThemeScript("sepia")).toBe(computedBackgroundFor("theme-sepia"));
	});
});
