import { expect, test } from "@playwright/test";
import { CHAPTER_NOVEL_TITLE, seedChapterNovel } from "./helpers/chapter-novel";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 1920, height: 1080 });
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
});

test("the reader title's line leaves room for descenders", async ({ page }) => {
	const title = page.getByTestId("reader-bar").locator("h1");
	const { lineHeight, fontSize } = await title.evaluate((el) => {
		const style = getComputedStyle(el);
		return {
			lineHeight: Number.parseFloat(style.lineHeight),
			fontSize: Number.parseFloat(style.fontSize),
		};
	});
	expect(lineHeight).toBeGreaterThanOrEqual(fontSize * 1.2);
});

test("on desktop the header row and the progress footer sit on the text column", async ({
	page,
}) => {
	const boxOf = async (selector: string) => {
		const box = await page.locator(selector).first().boundingBox();
		if (!box) throw new Error(`${selector} is not rendered`);
		return { x: Math.round(box.x), width: Math.round(box.width) };
	};
	const column = await boxOf(".reader-scroll-content");
	expect(column.width).toBeLessThan(1920 / 2);
	expect(await boxOf('[data-testid="reader-bar"] > div')).toEqual(column);
	expect(await boxOf(".reader-progress-bar")).toEqual(column);
});
