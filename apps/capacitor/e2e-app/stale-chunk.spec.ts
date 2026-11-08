import {
	buildEpubBuffer,
	strayAnchorFixture,
} from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { resetAppStorage } from "./support/app";

const STATS_CHUNK = /\/app\/assets\/stats-[^/]+\.js$/;
const LICENSES_CHUNK = /\/app\/assets\/licenses-[^/]+\.js$/;
const EPUB_CHUNK = /\/app\/assets\/epub-[^/]+\.js$/;

test.beforeEach(async ({ page }) => {
	await page.route(/catalog\.lesefluss\.app/, (route) => route.abort());
});

/**
 * Sends a chunk to a file the server no longer has, the way a deploy leaves a
 * tab opened before it. Once the page reloaded it gets the real file again,
 * standing in for the new build, unless `afterReload` is "still-missing".
 */
async function deleteChunk(
	page: Page,
	chunk: RegExp,
	afterReload: "restored" | "still-missing" = "restored",
) {
	let reloaded = false;
	page.once("load", () => {
		reloaded = true;
	});
	await page.route(chunk, (route) => {
		if (reloaded && afterReload === "restored") return route.continue();
		const gone = new URL("/app/assets/chunk-deleted-by-deploy.js", route.request().url());
		return route.continue({ url: gone.href });
	});
}

async function openApp(page: Page, path: string, ready: string) {
	await page.setViewportSize({ width: 390, height: 844 });
	await resetAppStorage(page);
	await page.goto(path);
	await expect(page.getByText(ready).first()).toBeVisible();
}

function countLoads(page: Page): () => number {
	let loads = 0;
	page.on("load", () => loads++);
	return () => loads;
}

function deletedChunkServed(page: Page) {
	return page.waitForResponse((res) => res.url().endsWith("/chunk-deleted-by-deploy.js"));
}

test("a missing /app/assets file is a 404, an app route still gets the shell", async ({
	request,
}) => {
	const missing = await request.get("/app/assets/chunk-deleted-by-deploy.js");
	expect(missing.status()).toBe(404);
	expect(missing.headers()["content-type"] ?? "").not.toContain("text/html");

	const route = await request.get("/app/tabs/stats");
	expect(route.status()).toBe(200);
	expect(route.headers()["content-type"]).toContain("text/html");
	expect(await route.text()).toContain('<div id="root">');
});

test("a route whose chunk a deploy deleted recovers with one reload", async ({ page }) => {
	await openApp(page, "/app/tabs/library", "No books yet");
	await deleteChunk(page, STATS_CHUNK);
	const loads = countLoads(page);

	await page.getByRole("button", { name: "Reading stats" }).click();

	await expect(page.getByRole("heading", { name: "No stats yet" })).toBeVisible();
	await expect(page).toHaveURL(/\/app\/tabs\/library\/stats$/);
	expect(loads()).toBe(1);
});

test("a link's failed hover preload leaves the page, the tap then lands on its route", async ({
	page,
}) => {
	await openApp(page, "/app/tabs/settings", "Open source licenses");
	await deleteChunk(page, LICENSES_CHUNK);
	const loads = countLoads(page);
	const link = page.getByRole("link", { name: /Open source licenses/ });

	const preloadFailed = deletedChunkServed(page);
	await link.hover();
	await preloadFailed;
	await expect(page).toHaveURL(/\/app\/tabs\/settings$/);
	expect(loads()).toBe(0);

	await link.click();
	await expect(page.getByText("Atkinson Hyperlegible")).toBeVisible();
	await expect(page).toHaveURL(/\/app\/tabs\/settings\/licenses$/);
	expect(loads()).toBe(1);
});

test("a chunk still missing after the reload does not reload again", async ({ page }) => {
	await openApp(page, "/app/tabs/library", "No books yet");
	await deleteChunk(page, STATS_CHUNK, "still-missing");
	const loads = countLoads(page);

	await page.getByRole("button", { name: "Reading stats" }).click();

	await expect.poll(loads).toBe(1);
	await expect(page.getByText("Something went wrong!")).toBeVisible();
	await expect(page.locator("#root")).toBeVisible();
	expect(loads()).toBe(1);
});

test("an import whose parser chunk a deploy deleted reloads at the next navigation", async ({
	page,
}) => {
	const fixture = strayAnchorFixture();
	const epub = {
		name: "stray-anchors.epub",
		mimeType: "application/epub+zip",
		buffer: await buildEpubBuffer(fixture),
	};
	const pickFile = async () => {
		await page.getByRole("button", { name: "Add book" }).click();
		const chooser = page.waitForEvent("filechooser");
		await page.getByRole("button", { name: "Import file" }).click();
		await (await chooser).setFiles(epub);
	};
	await openApp(page, "/app/tabs/library", "No books yet");
	await deleteChunk(page, EPUB_CHUNK);
	const loads = countLoads(page);

	const parserFailed = deletedChunkServed(page);
	await pickFile();
	await parserFailed;
	expect(loads()).toBe(0);
	await page.keyboard.press("Escape");

	await page.getByRole("button", { name: "Reading stats" }).click();
	await expect(page.getByRole("heading", { name: "No stats yet" })).toBeVisible();
	expect(loads()).toBe(1);

	await page.goBack();
	await expect(page.getByText("No books yet")).toBeVisible();
	await pickFile();
	await page.getByRole("button", { name: "Add to library" }).click({ timeout: 20_000 });
	await expect(page.locator(`[data-book-title="${fixture.title}"]`)).toHaveCount(1, {
		timeout: 20_000,
	});
	expect(loads()).toBe(1);
});
