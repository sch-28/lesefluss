import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	buildEpubBuffer,
	strayAnchorFixture,
} from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { resetAppStorage } from "./support/app";
import { WEB } from "./support/db.mjs";

/** LESE-20.7: the service worker that keeps the app shell for offline starts. */
test.use({ serviceWorkers: "allow" });

const fixture = strayAnchorFixture();
const BOOK_TEXT = "Chapter 1 opening paragraph anchors the scene.";
const updateBar = (page: Page) =>
	page.getByRole("status").filter({ hasText: "A new version is ready" });

test.beforeEach(async ({ page }) => {
	await page.route(/catalog\.lesefluss\.app/, (route) => route.abort());
	await page.setViewportSize({ width: 390, height: 844 });
	await resetAppStorage(page);
});

async function openOnline(page: Page) {
	await page.goto("/app/tabs/library");
	await expect(page.getByText("No books yet")).toBeVisible();
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
}

async function importBook(page: Page) {
	await page.getByRole("button", { name: "Add book" }).click();
	const chooser = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Import file" }).click();
	await (await chooser).setFiles({
		name: "stray-anchors.epub",
		mimeType: "application/epub+zip",
		buffer: await buildEpubBuffer(fixture),
	});
	await page.getByRole("button", { name: "Add to library" }).click({ timeout: 20_000 });
	await expect(page.locator(`[data-book-title="${fixture.title}"]`)).toHaveCount(1, {
		timeout: 20_000,
	});
}

const SERVED_WORKER = resolve(WEB, ".output/public/app/sw.js");
let servedWorker: string | null = null;

test.afterEach(() => {
	if (servedWorker !== null) writeFileSync(SERVED_WORKER, servedWorker);
	servedWorker = null;
});

/**
 * Changes the served worker the way the next deploy does. page.route never sees
 * the browser's worker update check, so the file itself changes. The server
 * sends the build-time length, so the new script keeps it; dropping the
 * browser's HTTP cache keeps a stale ETag from answering 304.
 */
async function deployNewWorker(page: Page) {
	servedWorker = readFileSync(SERVED_WORKER, "utf8");
	const next = servedWorker.replace(/"version":"([0-9a-f]{16})"/, (_m, version: string) => {
		const other = version === "0".repeat(16) ? "1".repeat(16) : "0".repeat(16);
		return `"version":"${other}"`;
	});
	expect(next).not.toBe(servedWorker);
	writeFileSync(SERVED_WORKER, next);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Network.clearBrowserCache");
	await cdp.detach();
}

const checkForUpdate = (page: Page) =>
	page.evaluate(async () => {
		const reg = await navigator.serviceWorker.getRegistration("/app/");
		await reg?.update();
	});

test("opened once online, it opens offline with the library and its books", async ({
	page,
	context,
}) => {
	await openOnline(page);
	await importBook(page);

	await context.setOffline(true);
	await page.reload();
	await expect(page.locator(`[data-book-title="${fixture.title}"]`)).toHaveCount(1);
	await page.locator(`[data-book-title="${fixture.title}"]`).click();
	await expect(page.getByText(BOOK_TEXT)).toBeVisible();

	await page.goto("/app/tabs/settings");
	await expect(page.getByRole("heading", { name: "Settings" }).first()).toBeVisible();
});

test("server calls and missing files never come from the worker", async ({ page, context }) => {
	await openOnline(page);
	await page.reload();
	await expect(page.getByText("No books yet")).toBeVisible();
	expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

	const online = await page.evaluate(async () => {
		const api = await fetch("/api/auth/get-session");
		const missing = await fetch("/app/assets/chunk-deleted-by-deploy.js");
		return {
			api: api.status,
			missing: missing.status,
			missingType: missing.headers.get("content-type") ?? "",
		};
	});
	expect(online.api).toBeLessThan(500);
	expect(online.missing).toBe(404);
	expect(online.missingType).not.toContain("text/html");

	await context.setOffline(true);
	const offline = await page.evaluate(async () => {
		const outcome = (url: string) =>
			fetch(url).then(
				(r) => `status ${r.status}`,
				() => "network error",
			);
		return {
			api: await outcome("/api/auth/get-session"),
			missing: await outcome("/app/assets/chunk-deleted-by-deploy.js"),
		};
	});
	expect(offline).toEqual({ api: "network error", missing: "network error" });
});

test("the worker script is never cached by the browser", async ({ request }) => {
	const sw = await request.get("/app/sw.js");
	expect(sw.status()).toBe(200);
	expect(sw.headers()["cache-control"]).toBe("no-cache");
	expect(sw.headers()["content-type"]).toContain("javascript");
	for (const path of ["/app/manifest.webmanifest", "/app/icons/missing.png", "/app/missing.js"]) {
		const res = await request.get(path);
		expect(res.headers()["content-type"] ?? "", path).not.toContain("text/html");
	}
});

test("a new deploy waits while a book is open, then the bar reloads into it", async ({ page }) => {
	await openOnline(page);
	await importBook(page);
	await page.reload();
	await expect(page.locator(`[data-book-title="${fixture.title}"]`)).toHaveCount(1);
	const firstWorker = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL);
	expect(firstWorker).toContain("/app/sw.js");

	await page.locator(`[data-book-title="${fixture.title}"]`).click();
	await expect(page.getByText(BOOK_TEXT)).toBeVisible();
	await deployNewWorker(page);
	await checkForUpdate(page);
	await page.waitForFunction(async () => {
		const reg = await navigator.serviceWorker.getRegistration("/app/");
		return Boolean(reg?.waiting);
	});
	await expect(updateBar(page)).toHaveCount(0);

	await page.getByRole("button", { name: "Back" }).first().click();
	await expect(updateBar(page)).toBeVisible();
	await expect(updateBar(page)).toContainText("Your place is saved.");

	const reloaded = page.waitForEvent("load");
	await updateBar(page).getByRole("button", { name: "Reload" }).click();
	await reloaded;
	await expect(page.locator(`[data-book-title="${fixture.title}"]`)).toHaveCount(1);
	await expect(updateBar(page)).toHaveCount(0);
	expect(
		await page.evaluate(async () => {
			const reg = await navigator.serviceWorker.getRegistration("/app/");
			return {
				waiting: Boolean(reg?.waiting),
				controlled: Boolean(navigator.serviceWorker.controller),
			};
		}),
	).toEqual({ waiting: false, controlled: true });
});

test("the bar can be put away", async ({ page }) => {
	await openOnline(page);
	await page.reload();
	await expect(page.getByText("No books yet")).toBeVisible();
	await deployNewWorker(page);
	await checkForUpdate(page);
	await expect(updateBar(page)).toBeVisible();
	await updateBar(page).getByRole("button", { name: "Dismiss" }).click();
	await expect(updateBar(page)).toHaveCount(0);
});
