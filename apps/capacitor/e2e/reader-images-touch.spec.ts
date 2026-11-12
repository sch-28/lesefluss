import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

// A phone-width reader: these cover single-page mechanics, and the spread starts at 900px.
test.use({ viewport: { width: 420, height: 800 } });

/**
 * The touch path: a long press arms selection, the finger then crosses a
 * figure (no word under it) on its way to the next paragraph. A press that
 * starts on the figure itself starts no selection (word-gestures.test.ts)
 * and, in page mode, turns no page.
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

test("a touch long-press on a figure in page mode turns no page", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);
	await reader.setPaginationStyle(page, "page");
	const before = await reader.pageModeFirstVisibleWord(page);

	// Pressed inside the next-page third, where a tap would turn the page.
	const box = await page.locator('.reader-figure img[alt="Plate 1"]').boundingBox();
	if (!box) throw new Error("Plate 1 is not on the page");
	const point = { x: box.x + box.width - 8, y: box.y + box.height / 2 };
	const width = page.viewportSize()?.width ?? 0;
	expect(point.x).toBeGreaterThan(width * 0.67);
	expect(point.x).toBeLessThan(width);
	await reader.expectNoSaveDuring(page, () => reader.touchLongPressBetween(page, point, point));
	await expect(reader.selectionToolbar(page)).toHaveCount(0);
	expect(await reader.pageModeFirstVisibleWord(page)).toBe(before);
});
