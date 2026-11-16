import { expect, type Page, test } from "@playwright/test";
import {
	CHAPTER_NOVEL_TITLE,
	chapterHeading,
	openingPhrase,
	seedChapterNovel,
} from "./helpers/chapter-novel";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * A chapter jump lands on the chapter's first word, its heading's: from book
 * detail's chapter list (with no reader mounted, so the reopen proves it was
 * saved), from Contents in scroll mode and in page mode, where the pick is saved too. Not on the previous
 * chapter's last word, where a start on the heading's `# ` marker used to map.
 * Right-click stands in for the card's long press.
 */

const CHAPTER = 3;

/** The first word of chapter `n`'s heading, read from the scroll reader. */
async function headingWord(page: Page, n: number): Promise<number> {
	const word = await page
		.locator(".reader-heading", { hasText: chapterHeading(n) })
		.getAttribute("data-heading-word");
	return Number(word);
}

/** Checks the scroll reader has chapter `n`'s heading on its top edge and returns the heading's first word. */
async function expectHeadingOnTop(page: Page, n: number): Promise<number> {
	const word = await headingWord(page, n);
	await expect.poll(() => reader.wordLineOffsetFromTop(page, word)).toBeLessThan(6);
	expect(await reader.wordLineOffsetFromTop(page, word)).toBeGreaterThanOrEqual(-2);
	await expect(
		page.locator("span[data-word]", { hasText: `ending${n - 1}x40` }),
		"the previous chapter's last line",
	).not.toBeInViewport();
	return word;
}

test("a chapter jump from book detail opens on the heading's first word, a reopen keeps it, and a TOC jump lands on the next heading", async ({
	page,
}) => {
	await seedChapterNovel(page);
	await page
		.locator(`[data-book-title="${CHAPTER_NOVEL_TITLE}"]`)
		.first()
		.click({ button: "right" });
	await page.getByRole("button", { name: "Details" }).click();
	await page.waitForURL(/\/tabs\/library\/book\//);
	// Scoped by heading: the "About this file" card also carries a Chapters row.
	const chapters = page
		.locator("section")
		.filter({ has: page.getByRole("heading", { name: /^Chapters/ }) });
	await chapters.getByRole("button", { name: new RegExp(`Chapter ${CHAPTER}$`) }).click();

	await page.waitForURL(/\/tabs\/reader\//);
	await reader.expectLoaded(page);
	await reader.waitRevealed(page);
	const id = reader.bookIdFromUrl(page);
	const word = await expectHeadingOnTop(page, CHAPTER);
	expect((await reader.savedRow(page, id))?.wordPosition).toBe(word);

	await page.goto("/tabs/library");
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.waitRevealed(page);
	expect(await expectHeadingOnTop(page, CHAPTER)).toBe(word);

	await reader.waitOpenSettled(page);
	const committed = await reader.moveToChapter(page, `Chapter ${CHAPTER + 1}`);
	await reader.waitPastJumpGuard(page);
	const next = await expectHeadingOnTop(page, CHAPTER + 1);
	const openingWord = await reader.firstWordPositionIn(
		page.locator("p.reader-paragraph", { hasText: openingPhrase(CHAPTER + 1) }),
	);
	// "Chapter Heading N" is three words, right before the opening paragraph.
	expect(next).toBe(openingWord - 3);
	expect(committed).toBe(next);
	expect(await reader.lastSavedWord(page)).toBe(next);
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

	const committed = await reader.moveToChapter(page, `Chapter ${CHAPTER}`);
	await expect(heading).toBeInViewport();
	await expect(previousLastWord).not.toBeInViewport();
	expect(committed).toBe(Number(await heading.getAttribute("data-heading-word")));

	await reader.leaveFlushed(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await expect(heading).toBeInViewport({ timeout: 10_000 });
	await expect(previousLastWord).not.toBeInViewport();
});

test("a scroll that comes to rest with a heading on the top edge saves the heading's first word", async ({
	page,
}) => {
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.waitOpenSettled(page);
	await reader.moveToChapter(page, `Chapter ${CHAPTER}`);
	await reader.waitPastJumpGuard(page);
	const heading = page.locator(".reader-heading", { hasText: chapterHeading(CHAPTER) });
	let saves = await reader.saveCount(page);
	await reader.wheel(page, -400);
	await reader.waitForSaveAbove(page, saves, 5000);
	saves = await reader.saveCount(page);

	await reader.wheelTargetTo(page, heading, "top");

	await reader.waitForSaveAbove(page, saves, 5000);
	expect(await reader.lastSavedWord(page)).toBe(await headingWord(page, CHAPTER));
});
