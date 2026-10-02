import {
	buildEpubBuffer,
	strayAnchorFixture,
} from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { type CatalogMockOpts, mockCatalogBook } from "./helpers/catalog-mock";
import { resetStorage } from "./helpers/seed";

const CATALOG_ID = "gutenberg:99998";
const fixture = strayAnchorFixture();
const TITLE = fixture.title ?? "Stray Anchor Test";
const FIRST_CHAPTER_TEXT = "Chapter 1 sixth paragraph closes the chapter completely.";
const DETAIL_PATH = `/tabs/explore/book/${encodeURIComponent(CATALOG_ID)}`;

let cleanup: (() => Promise<void>) | undefined;

async function openDetail(page: Page, opts: Partial<CatalogMockOpts> = {}) {
	const mock = await mockCatalogBook(page, {
		catalogId: CATALOG_ID,
		title: TITLE,
		epubBytes: await buildEpubBuffer(fixture),
		...opts,
	});
	cleanup = mock.cleanup;
	await page.goto(DETAIL_PATH);
	await expect(page.locator("section").getByRole("heading", { name: TITLE })).toBeVisible({
		timeout: 10_000,
	});
	return mock;
}

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
});

test.afterEach(async () => {
	await cleanup?.();
	cleanup = undefined;
});

test("Read now imports the book and opens it in the reader", async ({ page }) => {
	await openDetail(page);
	await page.getByRole("button", { name: "Read now" }).click();

	await page.waitForURL(/\/tabs\/reader\//, { timeout: 20_000 });
	await expect(page.locator("body")).toContainText(FIRST_CHAPTER_TEXT, { timeout: 10_000 });
});

test("Add to library imports and stays on the detail page", async ({ page }) => {
	await openDetail(page);
	await page.getByRole("button", { name: "Add to library" }).click();

	const toast = page.getByText(`Added "${TITLE}" to your library`);
	await expect(toast).toBeVisible({ timeout: 20_000 });
	expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
	await expect(page.getByRole("button", { name: "Open in Library" })).toBeVisible();

	await page.getByRole("button", { name: "Open", exact: true }).click();
	await page.waitForURL(/\/tabs\/reader\//, { timeout: 10_000 });
	await expect(page.locator("body")).toContainText(FIRST_CHAPTER_TEXT, { timeout: 10_000 });
});

test("a book already in the library opens it instead of importing again", async ({ page }) => {
	const { epubUrl } = await openDetail(page);
	await page.getByRole("button", { name: "Add to library" }).click();
	await expect(page.getByRole("button", { name: "Open in Library" })).toBeVisible({
		timeout: 20_000,
	});

	let epubRequests = 0;
	page.on("request", (req) => {
		if (req.url() === epubUrl) epubRequests++;
	});
	await page.reload();
	await expect(page.getByRole("button", { name: "Open in Library" })).toBeVisible({
		timeout: 10_000,
	});
	await expect(page.getByRole("button", { name: "Read now" })).toHaveCount(0);

	await page.getByRole("button", { name: "Open in Library" }).click();
	await page.waitForURL(/\/tabs\/library\/book\//, { timeout: 10_000 });
	expect(epubRequests).toBe(0);
});

test("a book without an EPUB points to its source instead of a dead button", async ({ page }) => {
	await openDetail(page, { hasEpub: false });

	await expect(page.getByText("No free EPUB")).toBeVisible();
	const sourceButton = page.getByRole("button", { name: "Read on Project Gutenberg" });
	await expect(sourceButton).toBeEnabled();
	await expect(page.getByRole("button", { name: "Read now" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Add to library" })).toHaveCount(0);

	const popup = page.waitForEvent("popup");
	await sourceButton.click();
	expect((await popup).url()).toContain("gutenberg.org/ebooks/99998");
});

test("a failed download shows a non-blocking error with Retry", async ({ page }) => {
	await openDetail(page, { epubFailures: [502] });
	await page.getByRole("button", { name: "Read now" }).click();

	await expect(page.getByText(`Couldn't add "${TITLE}"`)).toBeVisible({ timeout: 20_000 });
	// Non-blocking: no modal, the page's own actions stay usable.
	await expect(page.getByRole("alertdialog")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Read now" })).toBeEnabled();

	await page.getByRole("button", { name: "Retry" }).click();
	await page.waitForURL(/\/tabs\/reader\//, { timeout: 20_000 });
	await expect(page.locator("body")).toContainText(FIRST_CHAPTER_TEXT, { timeout: 10_000 });
});
