import { test } from "@playwright/test";
import { openBigBookInPageMode } from "./helpers/big-book";
import { reader } from "./page-objects/reader";

/**
 * Font size and line spacing both reflow the multicol layout, which changes
 * how many words fit on a page. Like a rotation, that invalidates the current
 * page index, so the reader has to re-anchor on the word the user was reading.
 *
 * Phone-sized viewport on purpose: a page that holds only a few hundred words
 * shifts noticeably on a reflow, whereas a desktop-width page is large enough
 * to keep the same word on screen by luck.
 */
const PHONE = { width: 420, height: 900 };

test.beforeEach(async ({ page }) => {
	await page.setViewportSize(PHONE);
	await openBigBookInPageMode(page);
	await reader.turnPages(page, 5);
});

test("bumping the font size keeps the current word on screen in page mode", async ({ page }) => {
	const word = await reader.pageModeFirstVisibleWord(page);

	await reader.increaseFontSize(page);
	await reader.increaseFontSize(page);

	await reader.expectWordVisibleInPage(page, word);
});

test("bumping the line spacing keeps the current word on screen in page mode", async ({ page }) => {
	const word = await reader.pageModeFirstVisibleWord(page);

	// One 0.1 step barely moves the page boundary; go from the 1.8 default to
	// 2.3 so the density change is big enough to expose a stale page index.
	for (let i = 0; i < 5; i++) await reader.increaseLineSpacing(page);

	await reader.expectWordVisibleInPage(page, word);
});
