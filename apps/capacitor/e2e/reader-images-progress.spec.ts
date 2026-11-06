import { expect, type Locator, type Page, test } from "@playwright/test";
import {
	bigBookFixture,
	FULL_PAGE_FIGURE_BEFORE,
	openBigBookInPageMode,
	seedBigBook,
} from "./helpers/big-book";
import { openBookFromLibrary, seedFixture, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Figures are block elements with no word spans. Position saving, restore,
 * jumps and pagination must behave exactly as they do for text: a figure at
 * the viewport top makes the paragraph after it the position, and a
 * figure-only page saves nothing and never rewinds. A selection across a
 * figure is reader-images-touch.spec.ts's.
 */

const MAX_PAGE_TURNS = 60;

/** The paragraph rendered right after `figure`. */
function paragraphAfter(figure: Locator): Locator {
	return figure.locator("xpath=following-sibling::p[1]");
}

/** Page down until `target` is mounted by the virtual list. */
async function scrollUntilAttached(page: Page, target: Locator) {
	await expect(async () => {
		if ((await target.count()) === 0) await page.keyboard.press("PageDown");
		await expect(target).toBeAttached({ timeout: 300 });
	}).toPass({ timeout: 20_000 });
}

test("a figure at the viewport top makes the paragraph after it the position, and reopening lands there", async ({
	page,
}) => {
	// The big book: enough text after the figure for it to reach the top.
	const title = await seedBigBook(page);
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);

	const figure = page.locator('.reader-figure:has(img[alt="Figure 15"])');
	await scrollUntilAttached(page, figure);
	const expected = await reader.firstWordPositionIn(paragraphAfter(figure));
	expect(expected).toBeGreaterThan(0);

	// Park the figure at the bottom first so the move to the top is a real
	// scroll. The settle saves the paragraph after the figure as the position.
	await reader.wheelTargetTo(page, figure, "bottom");
	// This move's settle, and its save if any, must be done before the next one.
	await reader.waitPositionQuiet(page);
	const savePending = reader.waitForNextSave(page);
	await reader.wheelTargetTo(page, figure, "top");
	await savePending;

	// Client-side navigation keeps the save hook alive across the unmount flush.
	await page.goBack();
	await page.waitForURL(/\/tabs\/library/);
	await expect.poll(() => reader.lastSavedWord(page), { timeout: 10_000 }).toBe(expected);

	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	// Opening aligns the saved word to the top: a different saved word would
	// put a different word there.
	await expect.poll(() => reader.scrollModeTopWord(page), { timeout: 10_000 }).toBe(expected);
	await expect(figure).toBeAttached();
});

test("a TOC jump lands inside the chapter with its art visible", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	const lastWordOfChapterOne = await reader.wordPositionIn(
		page.locator("p", { hasText: "Chapter 1 sixth paragraph" }).locator("span[data-word]").last(),
	);

	const savePending = reader.waitForNextSave(page);
	await reader.moveToChapter(page, "2: Second");
	await expect(page.locator("h2", { hasText: "TITLE 2" })).toBeInViewport({ timeout: 5000 });
	await expect(page.locator('.reader-figure img[alt="Chapter art 2"]')).toBeInViewport();
	await savePending;

	const wordAtJump = await reader.lastSavedWord(page);
	const chapterTwoOpening = await reader.firstWordPositionIn(
		page.locator("p", { hasText: "Chapter 2 opening paragraph" }),
	);
	// A chapter's start word is floored onto the previous paragraph's last
	// word (`#` is not a word), so the lower bound is inclusive.
	expect(wordAtJump).toBeGreaterThanOrEqual(lastWordOfChapterOne);
	expect(wordAtJump).toBeLessThanOrEqual(chapterTwoOpening);
});

test("page mode turns across a page-sized figure and never rewinds", async ({ page }) => {
	await openBigBookInPageMode(page);
	await expect.poll(() => reader.pageModePageCount(page)).toBeGreaterThan(1);

	await reader.blurFocusedControl(page);
	const savedWordOr = async (fallback: number) =>
		(await reader.saveCount(page)) === 0 ? fallback : reader.lastSavedWord(page);
	// Opening at the start may not save anything yet.
	let previous = await savedWordOr(0);
	let sawTallFigure = false;
	const tallFigure = page.locator('.reader-figure img[alt="Figure 30"]');
	const tallFigureWord = await reader.firstWordPositionIn(
		page.locator("p", { hasText: `Paragraph ${FULL_PAGE_FIGURE_BEFORE} ` }),
	);
	// Turn until the paragraph after the tall figure has been saved, without
	// waiting for a save on every turn: a page that is only the figure saves
	// nothing. The turn loop itself proves the pagination is complete: a page
	// count that was too small would stop the turns short of the target.
	for (let turn = 0; turn < MAX_PAGE_TURNS && previous < tallFigureWord; turn++) {
		const settles = await reader.settleCount(page);
		await page.keyboard.press("ArrowRight");
		await reader.waitForSettleAbove(page, settles);
		if (await tallFigure.isVisible()) sawTallFigure = true;
		const saved = await savedWordOr(previous);
		expect(saved).toBeGreaterThanOrEqual(previous);
		previous = saved;
	}
	expect(previous).toBeGreaterThanOrEqual(tallFigureWord);
	expect(sawTallFigure).toBe(true);
});

/** Search for `phrase`, open its first result and commit it with "Read from
 *  here"; resolves once that save landed. */
async function searchAndJump(page: Page, phrase: string): Promise<void> {
	await reader.openSearch(page);
	const input = page.getByPlaceholder("Search in book\u2026");
	await expect(input).toBeVisible();
	await input.fill(phrase);
	await page.locator("ul li button", { hasText: phrase }).first().click();
	const savePending = reader.waitForNextSave(page);
	await reader.readFromHere(page);
	await savePending;
}

const AFTER_TALL_FIGURE = `Paragraph ${FULL_PAGE_FIGURE_BEFORE} contains`;

test("a search jump to the paragraph after a page-sized figure lands on it in page mode", async ({
	page,
}) => {
	await openBigBookInPageMode(page);
	await searchAndJump(page, AFTER_TALL_FIGURE);
	const targetWord = await reader.firstWordPositionIn(
		page.locator("p.reader-paragraph", { hasText: AFTER_TALL_FIGURE }),
	);
	await reader.expectWordVisibleInPage(page, targetWord);
	expect(await reader.lastSavedWord(page)).toBe(targetWord);
});

test("a book that opens on a page-sized figure saves nothing until the reader moves", async ({
	page,
}) => {
	const title = await seedFixture(page, bigBookFixture({ leadingFigure: true }), "lead.epub");
	await openBookFromLibrary(page, title);
	await page.waitForURL(/\/tabs\/reader\//);
	const frontispiece = page.locator('.reader-figure img[alt="Frontispiece"]');
	await expect(frontispiece).toBeInViewport({ timeout: 10_000 });
	// Nothing may be saved in the time an open's own scroll ends would come.
	await page.waitForTimeout(reader.LIST_SETTLE_MS);
	expect(await reader.saveCount(page)).toBe(0);

	await page.goBack();
	await page.waitForURL(/\/tabs\/library/);
	await openBookFromLibrary(page, title);
	await expect(frontispiece).toBeInViewport({ timeout: 10_000 });
});
