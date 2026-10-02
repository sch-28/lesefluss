import { imageFixture } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * The image fixture has five anchors over three paragraphs plus one trailing
 * image: a map carried from an image-only page, chapter art from a heading,
 * Kindle twins collapsed to one, an image inside a paragraph, and an SVG
 * `<image>` after the last paragraph.
 */
async function openImageBook(page: Page) {
	const title = await seedFixture(page, imageFixture(), "images.epub");
	await openBookFromLibrary(page, title);
}

async function expectFigures(page: Page) {
	const images = page.locator(".reader-figure img");
	await expect(images).toHaveCount(5);
	for (const img of await images.all()) {
		await expect(img).toHaveAttribute("src", /^data:image\/png;base64,/);
		await expect(img).toHaveAttribute("width", "1");
		await expect(img).toHaveAttribute("height", "1");
		await expect(img).toHaveAttribute("draggable", "false");
	}
	await expect(page.locator(".reader-figure span[data-word]")).toHaveCount(0);
	// The map precedes the first heading; the SVG image follows the last paragraph.
	const first = page.locator(".reader-figure, .reader-heading, .reader-paragraph").first();
	await expect(first).toHaveClass(/reader-figure/);
	const last = page.locator(".reader-figure, .reader-heading, .reader-paragraph").last();
	await expect(last).toHaveClass(/reader-figure/);
}

test("renders body images at their anchors in scroll mode", async ({ page }) => {
	await openImageBook(page);
	await reader.setPaginationStyle(page, "scroll");
	await expectFigures(page);
});

test("renders body images at their anchors in page mode", async ({ page }) => {
	await openImageBook(page);
	await reader.setPaginationStyle(page, "page");
	await expectFigures(page);
});
