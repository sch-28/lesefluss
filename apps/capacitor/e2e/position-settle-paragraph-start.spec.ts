import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, seedBigBook } from "./helpers/big-book";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Scroll ticks record the start of the paragraph at the top as the position,
 * so a settle on a paragraph's first word (or anywhere in a figure rendered
 * above a paragraph) matches the tick. These settles must still save, without
 * waiting for the flush on leaving the reader.
 */

const SETTLE_WAIT_MS = 5000;
/** Comfortably past the scroll view's 150ms scroll-end debounce. */
const NO_SAVE_WAIT_MS = 1000;

async function openBigBook(page: Page) {
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await page.waitForTimeout(reader.OPEN_SETTLE_MS);
}

/** The first word of "Paragraph <n>", read from the rendered spans. */
async function paragraphStartWord(page: Page, n: number): Promise<number> {
	return page.evaluate((n) => {
		const spans = [...document.querySelectorAll<HTMLElement>("span[data-word]")];
		const start = spans.find(
			(s, i) =>
				s.textContent?.trim() === "Paragraph" && spans[i + 1]?.textContent?.trim() === `${n}`,
		);
		if (!start) throw new Error(`No rendered Paragraph ${n}`);
		return Number(start.dataset.word);
	}, n);
}

/** Scrolls so the top of `selector`'s element sits `offsetPx` below the reader's top edge (negative: above it). */
async function scrollElementToTop(page: Page, selector: string, offsetPx = 0) {
	await page.evaluate(
		({ selector, offsetPx }) => {
			const target = document.querySelector<HTMLElement>(selector);
			if (!target) throw new Error(`Not rendered: ${selector}`);
			let container = target.parentElement;
			while (container && container.scrollHeight <= container.clientHeight) {
				container = container.parentElement;
			}
			if (!container) throw new Error("No scrollable reader container");
			// Floored: scrollTop snaps to whole pixels, and rounding up would leave the
			// target a fraction above the top edge, making the next line the top word.
			const delta = Math.floor(
				target.getBoundingClientRect().top - container.getBoundingClientRect().top - offsetPx,
			);
			container.scrollBy({ top: delta, behavior: "instant" });
		},
		{ selector, offsetPx },
	);
}

const wordSpan = (word: number) => `span[data-word="${word}"]`;

async function expectNoSaveFor(page: Page, ms: number) {
	const count = await reader.saveCount(page);
	await page.waitForTimeout(ms);
	expect(await reader.saveCount(page)).toBe(count);
}

async function expectSettleSaves(page: Page, before: number, word: number) {
	await reader.waitForSaveAbove(page, before, SETTLE_WAIT_MS);
	expect(await reader.lastSavedWord(page)).toBe(word);
}

test("a settle on a paragraph's first word saves it, and a reload resumes there", async ({
	page,
}) => {
	await openBigBook(page);
	const expected = await paragraphStartWord(page, 3);
	await expectNoSaveFor(page, NO_SAVE_WAIT_MS);
	const before = await reader.saveCount(page);

	await scrollElementToTop(page, wordSpan(expected));

	await expectSettleSaves(page, before, expected);
	await page.reload();
	await reader.expectLoaded(page);
	await expect.poll(() => reader.scrollModeTopWord(page), { timeout: 10_000 }).toBe(expected);
});

test("consecutive settles on paragraph starts each save", async ({ page }) => {
	await openBigBook(page);
	const third = await paragraphStartWord(page, 3);
	const sixth = await paragraphStartWord(page, 6);

	let before = await reader.saveCount(page);
	await scrollElementToTop(page, wordSpan(third));
	await expectSettleSaves(page, before, third);

	before = await reader.saveCount(page);
	await scrollElementToTop(page, wordSpan(sixth));
	await expectSettleSaves(page, before, sixth);
});

test("a settle with the top edge inside a figure saves the paragraph after it", async ({
	page,
}) => {
	await openBigBook(page);
	const figure = '.reader-figure:has(img[alt="Figure 15"])';
	for (let i = 0; i < 40 && (await page.locator(figure).count()) === 0; i++) {
		await reader.wheel(page, 600);
		await page.waitForTimeout(200);
	}
	await scrollElementToTop(page, figure, 200);
	await page.waitForTimeout(reader.OPEN_SETTLE_MS);
	const expected = await paragraphStartWord(page, 15);
	const before = await reader.saveCount(page);

	await scrollElementToTop(page, figure, -10);

	await expectSettleSaves(page, before, expected);
});

test("a settle mid-paragraph saves the top word", async ({ page }) => {
	await openBigBook(page);
	const start = await paragraphStartWord(page, 3);
	const before = await reader.saveCount(page);

	await scrollElementToTop(page, wordSpan(start), -40);

	await expectSettleSaves(page, before, await reader.scrollModeTopWord(page));
});

test("scrolling away and settling back on the saved word saves nothing", async ({ page }) => {
	await openBigBook(page);
	const start = await paragraphStartWord(page, 3);
	const before = await reader.saveCount(page);
	await scrollElementToTop(page, wordSpan(start));
	await expectSettleSaves(page, before, start);

	await scrollElementToTop(page, wordSpan(start), -40);
	await page.waitForTimeout(50);
	await scrollElementToTop(page, wordSpan(start));

	await expectNoSaveFor(page, NO_SAVE_WAIT_MS);
	expect(await reader.scrollModeTopWord(page)).toBe(start);
});
