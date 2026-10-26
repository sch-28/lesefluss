import { expect, type Page, test } from "@playwright/test";
import { PLAIN_BOOK_TITLE, plainBookFixture } from "./helpers/plain-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Page mode renders the book in chunks; a turn past a chunk's edge slides into
 * the neighbouring one. That turn saves the page it lands on, both ways.
 *
 * The reader is placed next to the boundary by a position from another device
 * rather than by turning there: a dozen quick turns cover two thousand words
 * faster than anyone reads, which is browsing, and browsing saves nothing.
 */

/** Opens the book in page mode on the page holding `word(chunkStart)`; returns the book id and chunk 1's first word. */
async function openAt(page: Page, word: (chunkStart: number) => number) {
	await page.setViewportSize({ width: 420, height: 900 });
	await seedFixture(page, plainBookFixture(), "plain.epub");
	await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.setPaginationStyle(page, "page");
	await reader.waitPositionQuiet(page);
	const id = reader.bookIdFromUrl(page);
	const chunkStart = await page.evaluate(() =>
		Number(
			document.querySelector('[data-chunk-index="1"] span[data-word]')?.getAttribute("data-word"),
		),
	);
	expect(chunkStart).toBeGreaterThan(0);
	const target = word(chunkStart);
	await page.evaluate(
		([id, word]) =>
			window.__lesefluss_e2e_remotePosition?.(id as string, word as number, Date.now()),
		[id, target] as const,
	);
	await reader.expectWordVisibleInPage(page, target);
	await reader.waitPositionQuiet(page);
	await reader.blurFocusedControl(page);
	return { id, chunkStart };
}

async function turn(page: Page, direction: "back" | "forward", via: "key" | "tap") {
	const saved = reader.waitForNextSave(page);
	if (via === "key") await page.keyboard.press(direction === "back" ? "ArrowLeft" : "ArrowRight");
	else {
		const box = await page.locator(".page-view").boundingBox();
		if (!box) throw new Error("No page view");
		const x = direction === "back" ? box.x + 40 : box.x + box.width - 40;
		await page.mouse.click(x, box.y + box.height / 2);
	}
	await saved;
}

async function expectSavedAndReopensOn(page: Page, id: string, word: number) {
	await reader.waitPositionQuiet(page);
	expect((await reader.savedRow(page, id))?.wordPosition).toBe(word);
	await reader.leaveFlushed(page);
	await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
	await reader.expectLoaded(page);
	await expect.poll(() => reader.pageModeFirstVisibleWord(page), { timeout: 10_000 }).toBe(word);
}

for (const via of ["key", "tap"] as const) {
	test(`a ${via} turn back across a chunk boundary saves the previous chunk's last page and reopens on it`, async ({
		page,
	}) => {
		const { id, chunkStart } = await openAt(page, (start) => start);

		await turn(page, "back", via);

		const words = await reader.pageModeVisibleWords(page);
		expect(words, "the previous chunk's last page").toContain(chunkStart - 1);
		await expectSavedAndReopensOn(page, id, words[0]);
	});

	test(`a ${via} turn forward across a chunk boundary saves the next chunk's first page and reopens on it`, async ({
		page,
	}) => {
		const { id, chunkStart } = await openAt(page, (start) => start - 1);

		await turn(page, "forward", via);

		expect(await reader.pageModeFirstVisibleWord(page)).toBe(chunkStart);
		await expectSavedAndReopensOn(page, id, chunkStart);
	});
}
