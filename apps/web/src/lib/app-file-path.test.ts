import { describe, expect, it } from "vitest";
import { isAppFilePath } from "./app-file-path";

describe("isAppFilePath", () => {
	it.each([
		"/app/assets/index-abc.js",
		"/app/assets/unknown",
		"/app/sw.js",
		"/app/manifest.webmanifest",
		"/app/icons/icon-192.png",
		"/app/favicon.png",
		"/app/covers/book.webp",
		"/app/logo.svg",
		"/app/assets/sql-wasm.wasm",
		"/app/workbox-1.MJS",
	])("refuses the shell for %s", (path) => {
		expect(isAppFilePath(path)).toBe(true);
	});

	it.each([
		"/app/",
		"/app/tabs/library",
		"/app/tabs/reader/42",
		"/app/book/abc-def",
		"/app/tabs/settings",
	])("answers %s with the shell", (path) => {
		expect(isAppFilePath(path)).toBe(false);
	});
});
