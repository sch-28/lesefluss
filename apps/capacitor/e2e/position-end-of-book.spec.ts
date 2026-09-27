import { buildEpubBuffer, type EpubFixture } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { bigBookFixture } from "./helpers/big-book";
import { importEpubViaFilePicker, openBookFromLibrary, resetStorage } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * TASK-174. Scroll mode saves the viewport-top word on scroll end and a
 * paragraph's first word on every scroll tick (flushed on leave). Neither may
 * move the saved position when the reader didn't:
 *  - near the end of a book the saved word can't reach the viewport top, so a
 *    scroll there (a layout clamp, the soft keyboard) must not save the earlier
 *    top word;
 *  - in a long paragraph its first word is far behind what is on screen, so
 *    leaving mid-scroll must not flush it.
 * Real moves, including backwards, must still save.
 */

const ONE_PARAGRAPH = "One Paragraph Test";
// The last paragraph of bigBookFixture() starts "Paragraph 60".
const LAST_PARAGRAPH_MARKER = "60";

function oneParagraphFixture(): EpubFixture {
	const sentences = Array.from(
		{ length: 200 },
		(_, i) => `Sentence ${i + 1} drifts along the river past the old mill.`,
	);
	return {
		title: ONE_PARAGRAPH,
		chapters: [{ id: "c1", href: "c1.htm", body: `<p>${sentences.join(" ")}</p>` }],
		navPoints: [{ label: "1: Start", href: "c1.htm" }],
	};
}

// Past the reader's post-open cooldown (scroll ends inside it are ignored by
// design) and past the virtual list re-measuring rows after a long scroll.
const SETTLE_MS = 1500;
// Well past virtua's 150ms scroll-end debounce: long enough for any settle a
// scroll would trigger to have run.
const QUIET_MS = 1000;

async function openSettled(page: Page, title: string): Promise<void> {
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await page.waitForTimeout(SETTLE_MS);
}

async function seedAndOpen(page: Page, fixture: EpubFixture, fileName: string): Promise<string> {
	const title = fixture.title ?? fileName;
	await resetStorage(page);
	await importEpubViaFilePicker(page, { buffer: await buildEpubBuffer(fixture), fileName, title });
	await openSettled(page, title);
	return title;
}

/** Move the reader's scroller by `dy` px without a user gesture, as a layout clamp does. */
async function shiftScroller(page: Page, dy: number): Promise<void> {
	await page.evaluate((delta) => {
		let el = document.querySelector("span[data-word]")?.parentElement ?? null;
		while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
		if (!el) throw new Error("No scrollable reader container");
		const before = el.scrollTop;
		el.scrollTop += delta;
		if (el.scrollTop === before) throw new Error("Scroller did not move");
	}, dy);
}

async function readerScrollerAtEnd(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		let el = document.querySelector("span[data-word]")?.parentElement ?? null;
		while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
		return !!el && el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
	});
}

async function wheel(page: Page, deltaY: number): Promise<void> {
	const centre = await page.evaluate(() => {
		let el = document.querySelector("span[data-word]")?.parentElement ?? null;
		while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
		if (!el) throw new Error("No scrollable reader container");
		const r = el.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	});
	await page.mouse.move(centre.x, centre.y);
	await page.mouse.wheel(0, deltaY);
}

/** Scroll and wait for the settle save it produces. */
async function wheelAndSettle(page: Page, deltaY: number): Promise<number> {
	const savePending = reader.waitForNextSave(page);
	await wheel(page, deltaY);
	await savePending;
	return reader.lastSavedWord(page);
}

/** Scroll to the end and tap the last paragraph, saving a word that can't reach the viewport top. */
async function saveAtLastParagraph(page: Page): Promise<number> {
	await wheel(page, 100_000);
	await expect.poll(() => readerScrollerAtEnd(page)).toBe(true);
	await page.waitForTimeout(SETTLE_MS);
	const word = await reader.wordPositionOf(page, LAST_PARAGRAPH_MARKER);
	const tapSave = reader.waitForNextSave(page);
	await reader.wordSpan(page, LAST_PARAGRAPH_MARKER).click();
	await tapSave;
	expect(await reader.lastSavedWord(page)).toBe(word);
	return word;
}

/** Leave the reader and wait until its unmount flush, if any, has committed. */
async function leaveReader(page: Page): Promise<void> {
	const bookId = reader.bookIdFromUrl(page);
	await page.goBack();
	await page.waitForURL(/\/tabs\/library/);
	await expect.poll(() => reader.getPendingPosition(page, bookId)).toBeNull();
	// The e2e save hook is published after the position push that follows the commit.
	await page.waitForTimeout(300);
}

/** Leave, then reopen and check the DB position is still `word` (it restores into view). */
async function expectSavedAfterLeaving(page: Page, title: string, word: number): Promise<void> {
	await leaveReader(page);
	expect(await reader.lastSavedWord(page)).toBe(word);
	await openSettled(page, title);
	await expect(page.locator(`span[data-word="${word}"]`)).toBeInViewport();
}

test("a scroll that doesn't move the view near the end of the book keeps the saved position", async ({
	page,
}) => {
	const title = await seedAndOpen(page, bigBookFixture(), "big.epub");
	const saved = await saveAtLastParagraph(page);
	await leaveReader(page);
	await openSettled(page, title);

	await shiftScroller(page, -1);
	await shiftScroller(page, 1);
	await page.waitForTimeout(QUIET_MS);

	await expectSavedAfterLeaving(page, title, saved);
});

test("a 1px clamp followed by the keyboard opening near the end keeps the saved position", async ({
	page,
}) => {
	const title = await seedAndOpen(page, bigBookFixture(), "big.epub");
	const saved = await saveAtLastParagraph(page);
	await leaveReader(page);
	await openSettled(page, title);

	// The device sequence: saving a highlight shrinks the content by 1px, which
	// clamps the scroller at the bottom, and the soft keyboard then shrinks the
	// viewport before that scroll's settle fires.
	const viewport = page.viewportSize();
	if (!viewport) throw new Error("No viewport size");
	await shiftScroller(page, -1);
	await page.setViewportSize({ width: viewport.width, height: viewport.height - 370 });
	await page.waitForTimeout(QUIET_MS);
	await page.setViewportSize(viewport);
	await page.waitForTimeout(QUIET_MS);

	await expectSavedAfterLeaving(page, title, saved);
});

test("the keyboard closing near the end keeps the saved position", async ({ page }) => {
	const title = await seedAndOpen(page, bigBookFixture(), "big.epub");
	const saved = await saveAtLastParagraph(page);
	await leaveReader(page);

	// Reopen with the keyboard "open" (a shorter viewport), then close it: the
	// taller viewport lowers the maximum scroll and clamps the scroller by far
	// more than a pixel, so the view really moves, yet stays at the bottom.
	const viewport = page.viewportSize();
	if (!viewport) throw new Error("No viewport size");
	await page.setViewportSize({ width: viewport.width, height: viewport.height - 300 });
	await openSettled(page, title);
	await page.setViewportSize(viewport);
	await page.waitForTimeout(QUIET_MS);

	await expectSavedAfterLeaving(page, title, saved);
});

test("scrolling up and straight back to the end keeps the saved position", async ({ page }) => {
	const title = await seedAndOpen(page, bigBookFixture(), "big.epub");
	const saved = await saveAtLastParagraph(page);
	await leaveReader(page);
	await openSettled(page, title);

	// Both wheels land within one scroll-end debounce, so there is a single
	// settle at the same offset, after ticks passed through earlier paragraphs.
	await wheel(page, -600);
	await page.mouse.wheel(0, 100_000);
	await page.waitForTimeout(QUIET_MS);

	await expectSavedAfterLeaving(page, title, saved);
});

test("leaving mid-scroll in a long paragraph never saves the paragraph start", async ({ page }) => {
	const title = await seedAndOpen(page, oneParagraphFixture(), "one-paragraph.epub");
	const settled = await wheelAndSettle(page, 2000);
	expect(settled).toBeGreaterThan(0);

	// A small forward scroll, then leave before it settles. Two frames let the
	// scroll event reach the reader; the scroll-end save comes later.
	await wheel(page, 80);
	await page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
	);

	await expectSavedAfterLeaving(page, title, settled);
});

test("scrolling back saves the earlier position, also when leaving mid-scroll", async ({
	page,
}) => {
	const title = await seedAndOpen(page, bigBookFixture(), "big.epub");

	// Each step leaves the reader, whose flush always writes the current word:
	// a settle may skip its own save when a tick already recorded the same word.
	await wheel(page, 2500);
	await page.waitForTimeout(QUIET_MS);
	await leaveReader(page);
	const ahead = await reader.lastSavedWord(page);

	await openSettled(page, title);
	await wheel(page, -800);
	await page.waitForTimeout(QUIET_MS);
	await leaveReader(page);
	const back = await reader.lastSavedWord(page);
	expect(back).toBeLessThan(ahead);

	await openSettled(page, title);
	await wheel(page, -800);
	await page.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
	);
	await leaveReader(page);
	expect(await reader.lastSavedWord(page)).toBeLessThan(back);
});
