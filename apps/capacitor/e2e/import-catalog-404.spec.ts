import { expect, test } from "@playwright/test";
import { resetStorage } from "./helpers/seed";

const CATALOG_HOST = "https://catalog.lesefluss.app";
const CATALOG_ID = "gutenberg:404404";

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
});

test("catalog book detail 404 surfaces a 'Couldn't load book' message", async ({ page }) => {
	await page.route(`${CATALOG_HOST}/books/${encodeURIComponent(CATALOG_ID)}`, (route) =>
		route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not_found"}' }),
	);

	await page.goto(`/tabs/explore/book/${encodeURIComponent(CATALOG_ID)}`);

	await expect(page.getByRole("heading", { name: "Couldn't load book" })).toBeVisible({
		timeout: 10_000,
	});
});
