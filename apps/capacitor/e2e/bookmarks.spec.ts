import { expect, type Page, test } from "@playwright/test";
import { CHAPTER_NOVEL_TITLE, seedChapterNovel } from "./helpers/chapter-novel";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

const ribbon = (page: Page) => page.getByRole("button", { name: "Bookmark", exact: true });
const ticks = (page: Page) => page.locator(".reader-bookmark-tick");
const rows = (page: Page) => page.locator("[data-bookmark-word]");

async function pressKey(page: Page, key: string) {
	await reader.blurFocusedControl(page);
	await page.keyboard.press(key);
}

async function openBookmarksTab(page: Page) {
	await reader.openContents(page);
	await page.getByRole("radio", { name: /^Bookmarks/ }).click();
}

async function bookmarkWords(page: Page): Promise<number[]> {
	await openBookmarksTab(page);
	const words = await rows(page).evaluateAll((els) =>
		els.map((el) => Number((el as HTMLElement).dataset.bookmarkWord)),
	);
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	return words;
}

async function moveAndSettle(page: Page, deltaY: number) {
	const saved = reader.waitForNextSave(page);
	await reader.wheel(page, deltaY);
	await saved;
}

async function expectWordOnTop(page: Page, word: number) {
	await expect.poll(() => reader.wordLineOffsetFromTop(page, word)).toBeLessThan(6);
	expect(await reader.wordLineOffsetFromTop(page, word)).toBeGreaterThanOrEqual(-2);
}

test("B bookmarks the screen without saving the position, and the Bookmarks tab opens it at its word", async ({
	page,
}) => {
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	const id = reader.bookIdFromUrl(page);

	await moveAndSettle(page, 2400);
	await expect(ribbon(page)).toHaveAttribute("aria-pressed", "false");
	const saved = (await reader.savedRow(page, id))?.wordPosition;
	const requests = await reader.saveRequestCount(page);
	const top = await reader.scrollModeTopWord(page);

	await pressKey(page, "b");
	await expect(ribbon(page)).toHaveAttribute("aria-pressed", "true");
	await expect(ticks(page)).toHaveCount(1);
	const [word] = await bookmarkWords(page);
	expect(word).toBeLessThanOrEqual(top);
	await expect(page.locator(`span[data-word="${word}"]`)).toBeInViewport();
	expect(await reader.saveRequestCount(page)).toBe(requests);
	expect((await reader.savedRow(page, id))?.wordPosition).toBe(saved);

	await pressKey(page, "b");
	await expect(ribbon(page)).toHaveAttribute("aria-pressed", "false");
	await expect(ticks(page)).toHaveCount(0);
	await ribbon(page).click();
	await expect(ribbon(page)).toHaveAttribute("aria-pressed", "true");
	expect(await bookmarkWords(page)).toEqual([word]);
	expect(await reader.saveRequestCount(page)).toBe(requests);

	await moveAndSettle(page, 9000);
	await expect(ribbon(page)).toHaveAttribute("aria-pressed", "false");
	await openBookmarksTab(page);
	await rows(page).first().getByRole("button").first().click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expectWordOnTop(page, word);
	await expect(ribbon(page)).toHaveAttribute("aria-pressed", "true");
	// A far jump browses: the reader keeps its spot until Read from here.
	await expect(reader.browseBar(page)).toBeVisible();
	expect(await reader.commitReadFromHere(page)).toBe(word);
});

test("Shift+B goes to the next bookmark and wraps to the first", async ({ page }) => {
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);

	await moveAndSettle(page, 2400);
	await pressKey(page, "b");
	await expect(ticks(page)).toHaveCount(1);
	await moveAndSettle(page, 6000);
	await pressKey(page, "b");
	await expect(ticks(page)).toHaveCount(2);
	const [first, second] = await bookmarkWords(page);
	expect(first).toBeLessThan(second);

	await pressKey(page, "Shift+B");
	await expectWordOnTop(page, first);
	await reader.waitPastJumpGuard(page);
	await pressKey(page, "Shift+B");
	await expectWordOnTop(page, second);
});

test("in page mode B bookmarks the page's first word, and the ribbon follows page turns", async ({
	page,
}) => {
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.expectLoaded(page);
	await reader.setPaginationStyle(page, "page");
	await reader.turnPages(page, 2);
	const first = await reader.pageModeFirstVisibleWord(page);
	const requests = await reader.saveRequestCount(page);

	await pressKey(page, "b");
	await expect(ribbon(page)).toHaveAttribute("aria-pressed", "true");
	expect(await bookmarkWords(page)).toEqual([first]);
	expect(await reader.saveRequestCount(page)).toBe(requests);

	await reader.turnPages(page, 1);
	await expect(ribbon(page)).toHaveAttribute("aria-pressed", "false");
	await pressKey(page, "ArrowLeft");
	await expect(ribbon(page)).toHaveAttribute("aria-pressed", "true");
});

test("a row's delete button removes that bookmark, its tick and the ribbon fill", async ({
	page,
}) => {
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);

	await moveAndSettle(page, 2400);
	await pressKey(page, "b");
	await expect(ticks(page)).toHaveCount(1);
	await moveAndSettle(page, 6000);
	await pressKey(page, "b");
	await expect(ticks(page)).toHaveCount(2);
	const [first, second] = await bookmarkWords(page);
	await expect(ribbon(page)).toHaveAttribute("aria-pressed", "true");
	const requests = await reader.saveRequestCount(page);

	await openBookmarksTab(page);
	await page
		.locator(`[data-bookmark-word="${second}"]`)
		.getByRole("button", { name: "Delete bookmark" })
		.click();
	await expect(rows(page)).toHaveCount(1);
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);

	await expect(ticks(page)).toHaveCount(1);
	await expect(ribbon(page)).toHaveAttribute("aria-pressed", "false");
	expect(await bookmarkWords(page)).toEqual([first]);
	expect(await reader.saveRequestCount(page)).toBe(requests);
});
