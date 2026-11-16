import { expect, type Page, test } from "@playwright/test";
import { reader } from "../e2e/page-objects/reader";
import { importFixtureBook, openBook } from "./support/library";

/**
 * LESE-121.6: the web database on every engine the web app supports. Runs in the
 * chromium, firefox and webkit projects (playwright.app.config.ts); WebKit comes
 * from Playwright's Docker image where the host can't launch it
 * (scripts/e2e-app-webkit.sh).
 */
type StoreKind = "opfs" | "legacy";

/**
 * The store each engine must end up on; a silent fallback to the legacy store fails
 * here. Playwright's WebKit build has no `navigator.storage`, so it covers the
 * no-OPFS fallback; OPFS on Safari is checked on a real iPhone (LESE-20.6).
 */
const EXPECTED_STORE: Record<string, StoreKind> = {
	chromium: "opfs",
	firefox: "opfs",
	webkit: "legacy",
};

/** The store the database driver logged on its last open. */
function watchStore(page: Page): () => StoreKind | null {
	let kind: StoreKind | null = null;
	page.on("console", (msg) => {
		const text = msg.text();
		if (text.includes("web storage: OPFS")) kind = "opfs";
		else if (text.includes("using the legacy store")) kind = "legacy";
	});
	return () => kind;
}

test("the library opens, saves and reads the same data back after a reload", async ({
	page,
	browserName,
}) => {
	const store = watchStore(page);
	const title = await importFixtureBook(page);
	await expect.poll(store).toBe(EXPECTED_STORE[browserName]);

	await openBook(page, title);
	await reader.expectLoaded(page);
	await reader.selectWords(page, "opening", "paragraph");
	const word = await reader.applyHighlight(page, "yellow");

	await page.reload();
	await reader.expectLoaded(page);
	await reader.expectHighlight(page, word, "yellow");

	await page.goto("/app/tabs/library");
	await expect(page.locator(`[data-book-title="${title}"]`)).toHaveCount(1, { timeout: 20_000 });
	expect(store()).toBe(EXPECTED_STORE[browserName]);
});
