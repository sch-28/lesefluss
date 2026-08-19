import { expect, test } from "@playwright/test";
import { openBigBookInPageMode } from "./helpers/big-book";
import { reader } from "./page-objects/reader";

/**
 * Page mode has no scrolling, so the scroll-driven hide path that scroll mode
 * relies on never fires here. The centre tap zone is the only affordance the
 * user has, so it must toggle rather than only show, and turning a page must
 * get the bar out of the way the same way scrolling does.
 */
test.beforeEach(async ({ page }) => {
	await openBigBookInPageMode(page);
});

test("centre tap toggles the progress bar in page mode", async ({ page }) => {
	const bar = reader.progressBar(page);
	await expect(bar).toBeHidden();

	await reader.tapPageCentre(page);
	await expect(bar).toBeVisible();

	await reader.tapPageCentre(page);
	await expect(bar).toBeHidden();
});

test("turning a page hides the progress bar in page mode", async ({ page }) => {
	const bar = reader.progressBar(page);

	await reader.tapPageCentre(page);
	await expect(bar).toBeVisible();

	await reader.turnPages(page, 1);
	await expect(bar).toBeHidden();
});
