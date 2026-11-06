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

test("Add to library stays on the detail page; the book then opens from the library, not a new download", async ({
	page,
}) => {
	const { epubUrl } = await openDetail(page);
	await page.getByRole("button", { name: "Add to library" }).click();

	await expect(page.getByText(`Added "${TITLE}" to your library`)).toBeVisible({
		timeout: 20_000,
	});
	expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
	await expect(page.getByRole("button", { name: "Open in Library" })).toBeVisible();

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

	await page.goto("/tabs/library");
	await page.locator(`[data-testid="library-card"][data-book-title="${TITLE}"]`).click();
	await page.waitForURL(/\/tabs\/reader\//, { timeout: 10_000 });
	await expect(page.locator("body")).toContainText(FIRST_CHAPTER_TEXT, { timeout: 10_000 });
	expect(epubRequests).toBe(0);
});
