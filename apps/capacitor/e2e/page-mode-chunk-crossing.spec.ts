import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, bigBookFixture } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

// Page mode lays out the book in chunks of about 2000 words and mounts the
// neighbours of the current chunk only after the current page has painted.

/** The page's first word, or null on a page that holds only a figure. */
const firstWordOrNull = async (page: Page) => (await reader.pageModeVisibleWords(page))[0] ?? null;

/** Waits until the page stops moving: the same words on two reads in a row. */
async function settledFirstWord(page: Page) {
	let last = "";
	await expect
		.poll(async () => {
			const now = JSON.stringify(await reader.pageModeVisibleWords(page));
			const isStable = now === last;
			last = now;
			return isStable;
		})
		.toBe(true);
	return firstWordOrNull(page);
}

async function openLongBookInPageMode(page: Page) {
	await seedFixture(page, bigBookFixture({ paragraphCount: 200 }), "long.epub");
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.setPaginationStyle(page, "page");
	await reader.blurFocusedControl(page);
}

/** First visible word of every page from the start until two chunk boundaries are behind. */
async function turnPastTwoChunks(page: Page) {
	const pages: (number | null)[] = [await settledFirstWord(page)];
	let furthest = pages[0] ?? -1;
	while (furthest < 2 * 2000) {
		expect(pages.length).toBeLessThan(80);
		await page.keyboard.press("ArrowRight");
		const first = await settledFirstWord(page);
		if (first !== null) {
			expect(first).toBeGreaterThan(furthest);
			furthest = first;
		}
		pages.push(first);
	}
	return pages;
}

async function searchFor(page: Page, phrase: string) {
	await page.getByRole("button", { name: "Search content" }).click();
	await page.getByPlaceholder("Search in book…").fill(phrase);
	await page.locator("ul li button", { hasText: phrase }).first().waitFor();
}

test("pages turn one by one across chunk boundaries both ways, and fast key turns are not lost", async ({
	page,
}) => {
	await openLongBookInPageMode(page);
	const pages = await turnPastTwoChunks(page);
	for (let i = pages.length - 2; i >= 0; i--) {
		await page.keyboard.press("ArrowLeft");
		expect(await settledFirstWord(page)).toBe(pages[i]);
	}

	// Faster than the turn animation, like a held page-turn button.
	for (let i = 1; i < pages.length; i++) {
		await page.keyboard.press("ArrowRight");
		await page.waitForTimeout(40);
	}
	expect(await settledFirstWord(page)).toBe(pages.at(-1));
});

test("turning back before the previous chunk has mounted lands on its last page", async ({
	page,
}) => {
	await openLongBookInPageMode(page);
	const pages = await turnPastTwoChunks(page);
	const secondChunkStart = pages.find((w) => w !== null && w >= 2000);
	const lastPageOfFirstChunk = pages[pages.indexOf(secondChunkStart ?? null) - 1];

	// Far away first, so chunk 0 is no longer mounted.
	await searchFor(page, "Paragraph 150 contains");
	await page.locator("ul li button").first().click();
	await expect.poll(() => firstWordOrNull(page)).toBeGreaterThan(4000);

	// Paragraph 64 opens the second chunk of this fixture.
	await searchFor(page, "Paragraph 64 contains");
	// Hold animation frames so the deferred neighbour mount cannot run before the turn.
	await page.evaluate(() => {
		const held: FrameRequestCallback[] = [];
		const original = window.requestAnimationFrame;
		window.requestAnimationFrame = (cb) => held.push(cb);
		Object.assign(window, {
			__releaseFrames: () => {
				window.requestAnimationFrame = original;
				for (const cb of held) original(cb);
			},
		});
		document.querySelector<HTMLButtonElement>("ul li button")?.click();
	});
	await expect.poll(() => firstWordOrNull(page)).toBe(secondChunkStart);
	await reader.blurFocusedControl(page);
	expect(await page.locator("[data-chunk-index='0']").count()).toBe(0);

	await page.keyboard.press("ArrowLeft");
	await expect.poll(() => firstWordOrNull(page)).toBe(lastPageOfFirstChunk);
	await page.evaluate(() =>
		(window as unknown as { __releaseFrames: () => void }).__releaseFrames(),
	);
});
