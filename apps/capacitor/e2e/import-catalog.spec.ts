import { expect, test } from "@playwright/test";
import {
	buildEpubBuffer,
	strayAnchorFixture,
} from "@lesefluss/book-import/test-fixtures/build-epub";
import { mockCatalogBook } from "./helpers/catalog-mock";
import { resetStorage } from "./helpers/seed";

const CATALOG_ID = "gutenberg:99999";

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
});

test("imports a book via the catalog flow with mocked endpoints", async ({ page }) => {
	const fixture = strayAnchorFixture();
	const epubBytes = await buildEpubBuffer(fixture);
	const { epubUrl, cleanup } = await mockCatalogBook(page, {
		catalogId: CATALOG_ID,
		title: fixture.title ?? "Stray Anchor Test",
		epubBytes,
	});
	// try/finally guarantees the page.route handlers unregister even when the
	// test body throws — keeps the dev server's route table clean for the
	// next test in the same worker.
	try {
		await page.goto(`/tabs/explore/book/${encodeURIComponent(CATALOG_ID)}`);

		const epubResponse = page.waitForResponse(epubUrl);
		await page.getByRole("button", { name: /^Download$/ }).click();
		await epubResponse;
		await page.waitForURL(/\/tabs\/library/, { timeout: 20_000 });

		const card = page.locator(`[data-testid="library-card"][data-book-title="${fixture.title ?? ""}"]`);
		await expect(card).toBeVisible({ timeout: 15_000 });
		await card.click();
		await page.waitForURL(/\/tabs\/reader\//, { timeout: 10_000 });
		await expect(page.locator("body")).toContainText("Chapter 1 sixth paragraph closes the chapter completely.", {
			timeout: 10_000,
		});
	} finally {
		await cleanup();
	}
});
