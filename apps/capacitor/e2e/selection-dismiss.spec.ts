import { expect, type Page, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * The selection toolbar has no close button, so in scroll mode it must go away
 * on Escape and on a click in empty reader space, while the click that ends a
 * mouse-drag selection must leave it open.
 */
async function openWithSelection(page: Page) {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);
	await reader.selectWords(page, "opening", "paragraph");
	const toolbar = page.getByRole("toolbar");
	await expect(toolbar).toBeVisible();
	return toolbar;
}

test("a mouse-drag selection keeps its toolbar after the mouse is released", async ({ page }) => {
	const toolbar = await openWithSelection(page);
	await page.waitForTimeout(300);
	await expect(toolbar).toBeVisible();
});

test("Escape dismisses the selection toolbar in scroll mode", async ({ page }) => {
	const toolbar = await openWithSelection(page);
	await page.keyboard.press("Escape");
	await expect(toolbar).toHaveCount(0);
	await expect(page.locator("span.word-selecting")).toHaveCount(0);
});

test("a click in the empty margin dismisses the selection toolbar in scroll mode", async ({
	page,
}) => {
	const toolbar = await openWithSelection(page);
	const word = await reader.wordSpan(page, "opening").boundingBox();
	const view = await page.getByTestId("reader-view").boundingBox();
	if (!word || !view) throw new Error("Reader not laid out");
	// Left of the text column, level with a line of text: inside the reader, on no word.
	await page.mouse.click(view.x + 3, word.y + word.height / 2);
	await expect(toolbar).toHaveCount(0);
});
