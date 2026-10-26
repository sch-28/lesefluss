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
 * A chapter that opens with a heading starts at the heading's first word. The
 * `# ` marker before it is not a word, and mapping its byte down to a word put
 * the chapter on the previous chapter's last word: a TOC jump landed with that
 * line on top and the heading below it, and Read from here saved it.
 */

/** Where the chapter's heading landed, and whether the previous chapter still shows above it. */
async function landing(page: Page, chapter: number) {
	return page.evaluate(
		({ heading, prevEnding }) => {
			const container = document.querySelector<HTMLElement>(".reader-scroll-content");
			const top = container?.getBoundingClientRect().top ?? 0;
			const bottom = container?.getBoundingClientRect().bottom ?? 0;
			const h = [...document.querySelectorAll<HTMLElement>(".reader-heading")].find(
				(e) => e.textContent?.trim() === heading,
			);
			const prev = [...document.querySelectorAll<HTMLElement>("span[data-word]")].find((s) =>
				s.textContent?.includes(prevEnding),
			);
			const prevTop = prev?.getBoundingClientRect().top;
			return {
				headingOffset: h ? h.getBoundingClientRect().top - top : null,
				headingWord: h?.dataset.headingWord ? Number(h.dataset.headingWord) : null,
				prevChapterVisible: prevTop !== undefined && prevTop >= top && prevTop < bottom,
			};
		},
		{ heading: chapterHeading(chapter), prevEnding: `ending${chapter - 1}x40` },
	);
}

for (const viewport of [
	{ width: 1100, height: 1000 },
	{ width: 420, height: 900 },
]) {
	for (const tag of ["h1", "h2"] as const) {
		for (const chapter of [3, 4]) {
			test(`a TOC jump to <${tag}> chapter ${chapter} lands on its heading and commits its first word at ${viewport.width}x${viewport.height}`, async ({
				page,
			}) => {
				await page.setViewportSize(viewport);
				await seedChapterNovel(page, { headingTag: tag });
				await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
				await reader.waitOpenSettled(page);

				await reader.tocJumpToChapter(page, `Chapter ${chapter}`);
				await expect(reader.browseBar(page)).toBeVisible();
				await reader.waitPastJumpGuard(page);
				const landed = await landing(page, chapter);
				const openingWord = await reader.firstWordPositionIn(
					page.locator("p.reader-paragraph", { hasText: openingPhrase(chapter) }),
				);

				expect(landed.prevChapterVisible, "the previous chapter's last line").toBe(false);
				expect(landed.headingOffset, "the heading's distance from the top edge").not.toBeNull();
				expect(landed.headingOffset).toBeGreaterThanOrEqual(-2);
				expect(landed.headingOffset).toBeLessThan(6);
				// "Chapter Heading N" is three words, right before the opening paragraph.
				expect(landed.headingWord).toBe(openingWord - 3);

				expect(await reader.commitReadFromHere(page)).toBe(landed.headingWord);
			});
		}
	}
}

test("a scroll that comes to rest with a heading on the top edge saves the heading's first word", async ({
	page,
}) => {
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.waitOpenSettled(page);
	await reader.tocJumpToChapter(page, "Chapter 3");
	await expect(reader.browseBar(page)).toBeVisible();
	await reader.waitPastJumpGuard(page);
	await reader.commitReadFromHere(page);
	const heading = page.locator(".reader-heading", { hasText: chapterHeading(3) });
	let saves = await reader.saveCount(page);
	await reader.wheel(page, -400);
	await reader.waitForSaveAbove(page, saves, 5000);
	saves = await reader.saveCount(page);

	await reader.wheelTargetTo(page, heading, "top");

	await reader.waitForSaveAbove(page, saves, 5000);
	expect(await reader.lastSavedWord(page)).toBe(
		Number(await heading.getAttribute("data-heading-word")),
	);
});
