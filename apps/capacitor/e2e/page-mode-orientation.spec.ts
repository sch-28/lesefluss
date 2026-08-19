import { expect, test } from "@playwright/test";
import { openBigBookInPageMode } from "./helpers/big-book";
import { reader } from "./page-objects/reader";

const PORTRAIT = { width: 420, height: 900 };
const LANDSCAPE = { width: 900, height: 420 };

/**
 * Android keeps the Activity alive across a rotation (`android:configChanges`
 * covers `orientation|screenSize`), so the WebView is resized in place and the
 * reader's React state survives. `setViewportSize` reproduces that faithfully.
 *
 * A page index means nothing once the column geometry changes: page 6 of a
 * portrait layout holds different words than page 6 of a landscape one. The
 * reader must stay anchored to the word the user was on.
 */
test("rotating keeps the current word on screen in page mode", async ({ page }) => {
	await page.setViewportSize(PORTRAIT);
	await openBigBookInPageMode(page);

	// Get well away from page 0 so a stale page index lands on obviously
	// different content rather than coincidentally nearby text.
	await reader.turnPages(page, 5);
	const word = await reader.pageModeFirstVisibleWord(page);

	await page.setViewportSize(LANDSCAPE);
	await reader.expectWordVisibleInPage(page, word);

	await page.setViewportSize(PORTRAIT);
	await reader.expectWordVisibleInPage(page, word);
});

test("rotating does not move the saved reading position", async ({ page }) => {
	await page.setViewportSize(PORTRAIT);
	await openBigBookInPageMode(page);

	await reader.turnPages(page, 5);
	const savedBefore = await reader.lastSavedWord(page);
	const saveCountBefore = await reader.saveCount(page);

	await page.setViewportSize(LANDSCAPE);
	await reader.expectWordVisibleInPage(page, savedBefore);

	// Point-reading the counter would race a save still in flight: the hook is
	// bumped only after the DB write resolves. Give a spurious write a window to
	// land, and assert none does.
	await expect(reader.waitForSaveAbove(page, saveCountBefore, 1500)).rejects.toThrow();
	expect(await reader.lastSavedWord(page)).toBe(savedBefore);
});

/**
 * A height-only resize (Android keyboard, system bars appearing) reflows the
 * columns without changing `pageWidth`. Because a chunk's measured width is
 * quantised to whole columns, such a change can leave every value the lander
 * effect watches identical while still moving each page boundary, so the
 * re-anchor has to be driven by the layout inputs themselves.
 */
test("a height-only resize keeps the current word on screen in page mode", async ({ page }) => {
	await page.setViewportSize(PORTRAIT);
	await openBigBookInPageMode(page);

	await reader.turnPages(page, 5);
	const word = await reader.pageModeFirstVisibleWord(page);

	await page.setViewportSize({ width: PORTRAIT.width, height: 640 });
	await reader.expectWordVisibleInPage(page, word);
});
