import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * The touch path: a long press arms selection, the finger then crosses a
 * figure (no word under it) on its way to the next paragraph. A press that
 * starts on the figure itself must do nothing.
 */

test("a touch long-press dragged across a figure selects both ends and the highlight persists", async ({
	page,
}) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);

	// "third" is in the paragraph before Plate 1, "fourth" in the one after it.
	await reader.touchLongPressSelect(page, "third", "fourth");
	await expect(reader.selectionToolbar(page)).toBeVisible();
	await expect(reader.wordSpan(page, "third")).toHaveClass(/word-selecting/);
	await expect(reader.wordSpan(page, "fourth")).toHaveClass(/word-selecting/);

	const start = await reader.applyHighlight(page, "yellow");
	const end = await reader.wordPositionOf(page, "fourth");
	expect(end).toBeGreaterThan(start);
	await reader.dismissSelection(page);

	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);
	await reader.expectHighlight(page, start, "yellow");
	await reader.expectHighlight(page, end, "yellow");
});

test("a touch long-press on a figure opens no selection", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);

	await reader.touchLongPressOn(page, page.locator('.reader-figure img[alt="Plate 1"]'));
	await page.waitForTimeout(500);
	await expect(reader.selectionToolbar(page)).toHaveCount(0);
	await expect(page.locator(".word-selecting")).toHaveCount(0);
});

test("a touch long-press on a figure in page mode turns no page", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);
	await reader.setPaginationStyle(page, "page");
	const before = await reader.pageModeFirstVisibleWord(page);

	await reader.touchLongPressOn(page, page.locator('.reader-figure img[alt="Plate 1"]'));
	await page.waitForTimeout(500);
	await expect(reader.selectionToolbar(page)).toHaveCount(0);
	expect(await reader.pageModeFirstVisibleWord(page)).toBe(before);
});
