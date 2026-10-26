import { expect, type Page, test } from "@playwright/test";
import { CHAPTER_NOVEL_TITLE, chapterHeading, seedChapterNovel } from "./helpers/chapter-novel";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * A chapter jump lands on the chapter's first word, its heading's, along each
 * path there is: book detail's chapter list, a TOC jump from RSVP (which lands
 * in the standard view) and a TOC jump in page mode. Not on the previous
 * chapter's last word, where a start on the heading's `# ` marker used to map.
 */

const CHAPTER = 3;

/** The first word of chapter `n`'s heading, read from the scroll reader. */
async function headingWord(page: Page, n: number): Promise<number> {
	const word = await page
		.locator(".reader-heading", { hasText: chapterHeading(n) })
		.getAttribute("data-heading-word");
	return Number(word);
}

test("a chapter jump from book detail opens the reader on the heading's first word", async ({
	page,
}) => {
	await seedChapterNovel(page);
	await page
		.locator(`[data-book-title="${CHAPTER_NOVEL_TITLE}"]`)
		.first()
		.click({ button: "right" });
	await page.getByRole("button", { name: "Details" }).click();
	await page.waitForURL(/\/tabs\/library\/book\//);
	const chapters = page
		.locator("section")
		.filter({ has: page.getByRole("heading", { name: /^Chapters/ }) });
	await chapters.getByRole("button", { name: new RegExp(`Chapter ${CHAPTER}$`) }).click();

	await page.waitForURL(/\/tabs\/reader\//);
	await reader.expectLoaded(page);
	await reader.waitRevealed(page);
	const id = reader.bookIdFromUrl(page);
	const word = await headingWord(page, CHAPTER);
	expect((await reader.savedRow(page, id))?.wordPosition).toBe(word);
	await expect.poll(() => reader.wordLineOffsetFromTop(page, word)).toBeLessThan(6);
	expect(await reader.wordLineOffsetFromTop(page, word)).toBeGreaterThanOrEqual(-2);
});

test("a TOC jump from RSVP lands the standard view on the heading and commits its first word", async ({
	page,
}) => {
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.waitOpenSettled(page);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });

	await reader.tocJumpToChapter(page, `Chapter ${CHAPTER}`);
	await expect(page.locator(".rsvp-display")).toBeHidden();
	await expect(reader.browseBar(page)).toBeVisible();
	await reader.waitPastJumpGuard(page);
	const word = await headingWord(page, CHAPTER);
	const offset = await reader.wordLineOffsetFromTop(page, word);
	expect(offset).toBeGreaterThanOrEqual(-2);
	expect(offset).toBeLessThan(6);

	expect(await reader.commitReadFromHere(page)).toBe(word);
});

test("a TOC jump in page mode commits the heading's first word", async ({ page }) => {
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.waitOpenSettled(page);
	await reader.tocJumpToChapter(page, `Chapter ${CHAPTER}`);
	await reader.waitPastJumpGuard(page);
	const word = await headingWord(page, CHAPTER);
	await reader.browseBack(page);
	await reader.setPaginationStyle(page, "page");

	await reader.tocJumpToChapter(page, `Chapter ${CHAPTER}`);
	await expect(page.getByText(chapterHeading(CHAPTER))).toBeVisible();
	await expect(reader.browseBar(page)).toBeVisible();

	expect(await reader.commitReadFromHere(page)).toBe(word);
});

test("in page mode, a TOC jump to a heading on a later page than the previous chapter's last word lands on the heading's page, and a reopen returns there", async ({
	page,
}) => {
	await page.setViewportSize({ width: 420, height: 900 });
	await seedChapterNovel(page, { endFigure: true });
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.waitOpenSettled(page);
	await reader.setPaginationStyle(page, "page");
	const heading = page.locator(".page-view .reader-heading", { hasText: chapterHeading(CHAPTER) });
	// Chapter 2 ends in a tall figure, which takes its last text's page away from the heading.
	const previousLastWord = page.locator(".page-view span[data-word]", {
		hasText: `ending${CHAPTER - 1}x40.`,
	});

	await reader.tocJumpToChapter(page, `Chapter ${CHAPTER}`);
	await expect(heading).toBeInViewport();
	await expect(previousLastWord).not.toBeInViewport();
	const word = Number(await heading.getAttribute("data-heading-word"));
	expect(await reader.commitReadFromHere(page)).toBe(word);

	await reader.leaveFlushed(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await expect(heading).toBeInViewport({ timeout: 10_000 });
	await expect(previousLastWord).not.toBeInViewport();
});
