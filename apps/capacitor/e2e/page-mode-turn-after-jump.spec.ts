import { expect, type Page, test } from "@playwright/test";
import { CHAPTER_NOVEL_TITLE, seedChapterNovel } from "./helpers/chapter-novel";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * In page mode every page turn is the reader's, also right after a jump. The
 * scroll reader ignores settles for a while after a jump (its list reconciling
 * the jump); page mode has no such reconcile, and ignoring its turns lost them.
 */

async function openInPageMode(page: Page) {
	await page.setViewportSize({ width: 1100, height: 1000 });
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.waitOpenSettled(page);
	await reader.setPaginationStyle(page, "page");
	await expect(page.locator(".page-view span[data-word]").first()).toBeAttached();
}

async function tocJump(page: Page, label: string) {
	await page.getByRole("button", { name: "Contents and annotations" }).click();
	const button = page.getByRole("button", { name: label });
	await expect(button).toBeVisible();
	await button.click();
}

/** Turns one page forward by key and returns the new page's first word. */
async function turn(page: Page) {
	await reader.blurFocusedControl(page);
	const before = await reader.pageModeFirstVisibleWord(page);
	const settles = await reader.settleCount(page);
	await page.keyboard.press("ArrowRight");
	await reader.waitForSettleAbove(page, settles);
	const first = await reader.pageModeFirstVisibleWord(page);
	expect(first, "the turn moved a page forward").toBeGreaterThan(before);
	return first;
}

/** The book's row holds `word` once every save has committed, and a reopen lands on it. */
async function expectSavedAndReopensOn(page: Page, word: number) {
	await reader.waitPositionQuiet(page);
	const id = reader.bookIdFromUrl(page);
	expect((await reader.savedRow(page, id))?.wordPosition).toBe(word);
	await reader.leaveFlushed(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await expect.poll(() => reader.pageModeFirstVisibleWord(page), { timeout: 10_000 }).toBe(word);
}

test("a TOC jump, Read from here and a quick turn save the turned page, and so does a later turn", async ({
	page,
}) => {
	await openInPageMode(page);
	await tocJump(page, "Chapter 3");
	await expect(reader.browseBar(page)).toBeVisible();
	await reader.readFromHere(page);

	const quick = await turn(page);
	await reader.waitPositionQuiet(page);
	expect((await reader.savedRow(page, reader.bookIdFromUrl(page)))?.wordPosition).toBe(quick);

	await reader.waitPastJumpGuard(page);
	const later = await turn(page);

	await expectSavedAndReopensOn(page, later);
});

test("a jump to another page of the open chunk saves nothing itself, and a quick turn after it is saved", async ({
	page,
}) => {
	await openInPageMode(page);
	const saves = await page.evaluate(() => window.__lesefluss_e2e_saveLog?.length ?? 0);
	// Chapter 2 starts around word 1,200, inside the first 2,000-word chunk.
	await tocJump(page, "Chapter 2");
	await expect(reader.browseBar(page)).toBeVisible();
	await reader.readFromHere(page);

	const turned = await turn(page);

	await reader.waitPositionQuiet(page);
	const settleSaves = await page.evaluate(
		(from) =>
			(window.__lesefluss_e2e_saveLog ?? []).slice(from).filter((s) => s.source === "settle"),
		saves,
	);
	expect(
		settleSaves.map((s) => s.word),
		"only the turn settles",
	).toEqual([turned]);
	await expectSavedAndReopensOn(page, turned);
});

test("a turn while browsing after a jump, then Read from here, commits the page on screen", async ({
	page,
}) => {
	await openInPageMode(page);
	await tocJump(page, "Chapter 3");
	await expect(reader.browseBar(page)).toBeVisible();

	const turned = await turn(page);

	expect(await reader.commitReadFromHere(page)).toBe(turned);
	await expectSavedAndReopensOn(page, turned);
});

/** A word a few pages on, in the chunk the open page belongs to. */
async function wordFurtherInOpenChunk(page: Page): Promise<number> {
	const first = await reader.pageModeFirstVisibleWord(page);
	return page.evaluate((first) => {
		const chunk = document
			.querySelector(`.page-view span[data-word="${first}"]`)
			?.closest<HTMLElement>("[data-chunk-index]");
		const spans = [...(chunk?.querySelectorAll<HTMLElement>("span[data-word]") ?? [])];
		const word = Number(spans[Math.floor(spans.length * 0.4)]?.dataset.word);
		if (!Number.isInteger(word) || word <= first)
			throw new Error("No later word in the open chunk");
		return word;
	}, first);
}

test("a BLE device's live position moves the page without saving the page start, and a turn after it saves", async ({
	page,
}) => {
	await openInPageMode(page);
	const firstBefore = await reader.pageModeFirstVisibleWord(page);
	const deviceWord = await wordFurtherInOpenChunk(page);
	const requests = await reader.saveRequestCount(page);

	await page.evaluate((word) => window.__lesefluss_e2e_devicePosition?.(word), deviceWord);
	await reader.expectWordVisibleInPage(page, deviceWord);
	const firstAfter = await reader.pageModeFirstVisibleWord(page);
	expect(firstAfter, "the seek moved the page").not.toBe(firstBefore);
	expect(firstAfter, "the page starts before the device's word").toBeLessThan(deviceWord);
	await reader.waitPositionQuiet(page);
	expect(await reader.saveRequestCount(page), "the device's position is not saved back").toBe(
		requests,
	);

	const turned = await turn(page);
	await expectSavedAndReopensOn(page, turned);
});

test("a BLE position arriving while a turn is still sliding wins over the turn: nothing is saved or echoed", async ({
	page,
}) => {
	await page.clock.install();
	await openInPageMode(page);
	const id = reader.bookIdFromUrl(page);
	const deviceWord = await wordFurtherInOpenChunk(page);
	await reader.waitPositionQuiet(page);
	const requests = await reader.saveRequestCount(page);
	const settles = await reader.settleCount(page);
	await reader.blurFocusedControl(page);

	// The paused clock holds the turn's 220ms slide open while the device's position lands.
	await page.clock.pauseAt(Date.now() + 1000);
	await page.keyboard.press("ArrowRight");
	await page.evaluate((word) => window.__lesefluss_e2e_devicePosition?.(word), deviceWord);
	await page.clock.resume();
	await reader.expectWordVisibleInPage(page, deviceWord);
	await reader.waitPositionQuiet(page);

	expect(await reader.settleCount(page), "the turn's settle was dropped").toBe(settles);
	expect(
		await reader.saveRequestCount(page),
		"nothing saved, so nothing pushed to the device",
	).toBe(requests);
	expect((await reader.savedRow(page, id))?.wordPosition, "the device's word, not the turn's").toBe(
		deviceWord,
	);
});
