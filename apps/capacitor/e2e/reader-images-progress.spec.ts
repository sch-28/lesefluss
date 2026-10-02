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
 * the viewport top makes the paragraph after it the position, a figure-only
 * page saves nothing and never rewinds, and a selection may span a figure.
 */

const MAX_PAGE_DOWNS = 40;
const PAGE_DOWN_SETTLE_MS = 150;
const MAX_PAGE_TURNS = 60;
const PAGE_TURN_SETTLE_MS = 500;

/** The paragraph rendered right after `figure`. */
function paragraphAfter(figure: Locator): Locator {
	return figure.locator("xpath=following-sibling::p[1]");
}

/** Page down until `target` is mounted by the virtual list. */
async function scrollUntilAttached(page: Page, target: Locator) {
	for (let i = 0; i < MAX_PAGE_DOWNS && (await target.count()) === 0; i++) {
		await page.keyboard.press("PageDown");
		await page.waitForTimeout(PAGE_DOWN_SETTLE_MS);
	}
	await expect(target).toBeAttached();
}

test("a figure at the viewport top makes the paragraph after it the position, and reopening lands there", async ({
	page,
}) => {
	// The big book: enough text after the figure for it to reach the top.
	const title = await seedBigBook(page);
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await page.waitForTimeout(reader.OPEN_SETTLE_MS);

	const figure = page.locator('.reader-figure:has(img[alt="Figure 15"])');
	await scrollUntilAttached(page, figure);
	const expected = await reader.firstWordPositionIn(paragraphAfter(figure));
	expect(expected).toBeGreaterThan(0);

	// Park the figure at the bottom first so the move to the top is a real
	// scroll. The scroll tick records the paragraph after the figure as the
	// position and the settle finds the same word, so no extra write happens
	// here; leaving the reader flushes it.
	await figure.evaluate((el) => el.scrollIntoView({ block: "end" }));
	await page.waitForTimeout(reader.OPEN_SETTLE_MS);
	await figure.evaluate((el) => el.scrollIntoView({ block: "start" }));
	await page.waitForTimeout(reader.OPEN_SETTLE_MS);

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
	await page.waitForTimeout(reader.OPEN_SETTLE_MS);

	expect(await reader.pageModePageCount(page)).toBeGreaterThan(1);

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
		await page.keyboard.press("ArrowRight");
		await page.waitForTimeout(PAGE_TURN_SETTLE_MS);
		if (await tallFigure.isVisible()) sawTallFigure = true;
		const saved = await savedWordOr(previous);
		expect(saved).toBeGreaterThanOrEqual(previous);
		previous = saved;
	}
	expect(previous).toBeGreaterThanOrEqual(tallFigureWord);
	expect(sawTallFigure).toBe(true);
});

test("a highlight spanning a figure persists across reload", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);

	// "third" is in the paragraph before Plate 1, "fourth" in the one after it.
	await reader.selectWords(page, "third", "fourth");
	const start = await reader.applyHighlight(page, "yellow");
	const end = await reader.wordPositionOf(page, "fourth");
	expect(end).toBeGreaterThan(start);
	await reader.dismissSelection(page);

	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);
	await reader.expectHighlight(page, start, "yellow");
	await reader.expectHighlight(page, end, "yellow");
	await expect(page.locator('.reader-figure:has(img[alt="Plate 1"])')).toBeAttached();
});

/** Search for `phrase`, open its first result and commit it with "Read from
 *  here"; resolves once that save landed. */
async function searchAndJump(page: Page, phrase: string): Promise<void> {
	await page.getByRole("button", { name: "Search content" }).click();
	const input = page.getByPlaceholder("Search in book\u2026");
	await expect(input).toBeVisible();
	await input.fill(phrase);
	await page.locator("ul li button", { hasText: phrase }).first().click();
	const savePending = reader.waitForNextSave(page);
	await reader.readFromHere(page);
	await savePending;
}

const AFTER_TALL_FIGURE = `Paragraph ${FULL_PAGE_FIGURE_BEFORE} contains`;

test("a search jump to the paragraph after a page-sized figure lands on it in scroll mode", async ({
	page,
}) => {
	const title = await seedBigBook(page);
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);

	await searchAndJump(page, AFTER_TALL_FIGURE);
	const target = page.locator("p.reader-paragraph", { hasText: AFTER_TALL_FIGURE });
	await expect(target).toBeInViewport({ timeout: 5000 });
	const targetWord = await reader.firstWordPositionIn(target);
	expect(await reader.lastSavedWord(page)).toBe(targetWord);
	// The fine scroll aligns the target word at the top, the figure sits above it.
	await expect.poll(() => reader.scrollModeTopWord(page), { timeout: 5000 }).toBe(targetWord);
	await reader.waitPastJumpGuard(page);
	expect(await reader.lastSavedWord(page)).toBe(targetWord);
});

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
	await page.waitForTimeout(reader.OPEN_SETTLE_MS);
	expect(await reader.saveCount(page)).toBe(0);

	await page.goBack();
	await page.waitForURL(/\/tabs\/library/);
	await openBookFromLibrary(page, title);
	await expect(frontispiece).toBeInViewport({ timeout: 10_000 });
});
