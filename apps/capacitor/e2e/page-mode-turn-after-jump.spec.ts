import { expect, type Page, test } from "@playwright/test";
import { CHAPTER_NOVEL_TITLE, seedChapterNovel } from "./helpers/chapter-novel";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * In page mode every page turn is the reader's, also right after a jump. The
 * scroll reader ignores settles for a while after a jump (its list reconciling
 * the jump); page mode has no such reconcile, and ignoring its turns lost them.
 */

// The scroll reader's jump guard (JUMP_SETTLE_GUARD_MS): a turn inside it is what used to be lost.
const JUMP_GUARD_MS = 1500;

async function openInPageMode(page: Page) {
	await page.setViewportSize({ width: 1100, height: 1000 });
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.waitOpenSettled(page);
	await reader.setPaginationStyle(page, "page");
	await expect(page.locator(".page-view span[data-word]").first()).toBeAttached();
}

const lastJumpAt = (page: Page) => page.evaluate(() => window.__lesefluss_e2e_lastJumpAt ?? 0);
const lastSettleAt = (page: Page) =>
	page.evaluate(() => window.__lesefluss_e2e_settleLog?.at(-1)?.at ?? 0);

async function tocJump(page: Page, label: string) {
	await page.getByRole("button", { name: "Annotations" }).click();
	const button = page.getByRole("button", { name: label });
	await expect(button).toBeVisible();
	await button.click();
}

/**
 * Turns one page forward and returns the new page's first word. With
 * `insideJumpGuard`, also checks the turn's settle came within the guard window
 * of the last jump: a turn after it would pass whatever the guard does.
 */
async function turn(
	page: Page,
	{ via = "key", insideJumpGuard = false }: { via?: "key" | "tap"; insideJumpGuard?: boolean } = {},
) {
	await reader.blurFocusedControl(page);
	const before = await reader.pageModeFirstVisibleWord(page);
	const settles = await reader.settleCount(page);
	if (via === "key") await page.keyboard.press("ArrowRight");
	else {
		const box = await page.locator(".page-view").boundingBox();
		if (!box) throw new Error("No page view");
		await page.mouse.click(box.x + box.width - 60, box.y + box.height / 2);
	}
	await reader.waitForSettleAbove(page, settles);
	if (insideJumpGuard) {
		const gap = (await lastSettleAt(page)) - (await lastJumpAt(page));
		expect(gap, "the turn came too late to exercise the jump guard window").toBeLessThan(
			JUMP_GUARD_MS,
		);
	}
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

test("a TOC jump, Read from here and a quick key turn save the turned page", async ({ page }) => {
	await openInPageMode(page);
	await tocJump(page, "Chapter 3");
	await expect(reader.browseBar(page)).toBeVisible();
	await reader.readFromHere(page);

	const turned = await turn(page, { insideJumpGuard: true });

	await expectSavedAndReopensOn(page, turned);
});

test("a TOC jump, Read from here and a quick tap-zone turn save the turned page", async ({
	page,
}) => {
	await openInPageMode(page);
	await tocJump(page, "Chapter 3");
	await expect(reader.browseBar(page)).toBeVisible();
	await reader.readFromHere(page);

	const turned = await turn(page, { via: "tap", insideJumpGuard: true });

	await expectSavedAndReopensOn(page, turned);
});

test("a search jump, Read from here and a quick turn save the turned page", async ({ page }) => {
	await openInPageMode(page);
	await reader.openSearch(page);
	await page.getByPlaceholder("Search in book…").fill("Marker4x10 ");
	const result = page.locator("ul li button", { hasText: "Marker4x10" }).first();
	await expect(result).toBeVisible();
	await result.click();
	await expect(reader.browseBar(page)).toBeVisible();
	await reader.readFromHere(page);

	const turned = await turn(page, { insideJumpGuard: true });

	await expectSavedAndReopensOn(page, turned);
});

test("a jump to the word already read and a quick turn save the turned page", async ({ page }) => {
	await openInPageMode(page);
	await reader.moveToChapter(page, "Chapter 2");
	await reader.waitPastJumpGuard(page);
	// The same chapter again: the target is the current word, so this doesn't browse.
	await tocJump(page, "Chapter 2");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(reader.browseBar(page)).toBeHidden();

	const turned = await turn(page, { insideJumpGuard: true });

	await expectSavedAndReopensOn(page, turned);
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

	const turned = await turn(page, { insideJumpGuard: true });

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

// From the jump's own stamp, which is later than the click. A commit takes about
// 750ms after it, so the earliest turns are the quick cases above.
for (const delay of [1100, 1300, 1500, 1900, 2300, 3000]) {
	test(`a turn ${delay}ms after a TOC jump and Read from here is saved`, async ({ page }) => {
		await openInPageMode(page);
		await tocJump(page, "Chapter 3");
		await expect(reader.browseBar(page)).toBeVisible();
		await reader.readFromHere(page);
		const jumpedAt = await lastJumpAt(page);
		expect(
			(await page.evaluate(() => Date.now())) - jumpedAt,
			"the commit took longer than this delay",
		).toBeLessThanOrEqual(delay);
		await page.waitForFunction((due) => Date.now() >= due, jumpedAt + delay);

		const turned = await turn(page);

		await expectSavedAndReopensOn(page, turned);
	});
}

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
	await openInPageMode(page);
	const id = reader.bookIdFromUrl(page);
	const deviceWord = await wordFurtherInOpenChunk(page);
	await reader.waitPositionQuiet(page);
	const requests = await reader.saveRequestCount(page);
	const settles = await reader.settleCount(page);
	await reader.blurFocusedControl(page);

	// The slide takes 220ms; the device's position lands inside it.
	await page.keyboard.press("ArrowRight");
	await page.evaluate((word) => window.__lesefluss_e2e_devicePosition?.(word), deviceWord);
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
