import { expect, type Page, test } from "@playwright/test";
import { bigBookFixture } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * After an open the reader holds the saved word against the list's own
 * re-measuring, but never against the reader: a scroll that no re-measure
 * explains (a screen reader's scroll action, find-in-page), or the reader's
 * first move right after the text appears, is saved and stays.
 */

// Past the hold's quiet (300ms and a few frames) and any settle that follows.
const IDLE_MS = 2000;

async function reopenDeep(page: Page): Promise<string> {
	const title = await seedFixture(page, bigBookFixture({ paragraphCount: 200 }), "big.epub");
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	const savePending = reader.waitForNextSave(page);
	await reader.wheel(page, 3000);
	await savePending;
	// The unmount flush has committed: it can't pass for a save below.
	await reader.leaveFlushed(page);
	await openBookFromLibrary(page, title);
	return title;
}

const saveLogLength = (page: Page) =>
	page.evaluate(() => window.__lesefluss_e2e_saveLog?.length ?? 0);

/** The word of the first scroll-end save after `from` entries of the save log. */
async function settleSaveAfter(page: Page, from: number): Promise<number> {
	const word = await page.waitForFunction(
		(from) => window.__lesefluss_e2e_saveLog?.slice(from).find((s) => s.source === "settle")?.word,
		from,
		{ timeout: 5000 },
	);
	return (await word.jsonValue()) as number;
}

test("a scroll during the open hold that nothing re-measured is saved and not pulled back", async ({
	page,
}) => {
	await reopenDeep(page);
	await reader.waitRevealed(page);
	await page.waitForTimeout(IDLE_MS);
	const from = await saveLogLength(page);

	await page.evaluate(() => {
		const scroller = document.querySelector(".reader-scroll-content")?.firstElementChild;
		if (!scroller) throw new Error("No reader scroller");
		scroller.scrollTop += scroller.clientHeight / 2;
	});
	const saved = await settleSaveAfter(page, from);
	const top = await reader.scrollModeTopWord(page);
	expect(saved).toBe(top);
	await page.waitForTimeout(IDLE_MS);
	expect(await reader.scrollModeTopWord(page), "not pulled back").toBe(top);
});

test("a wheel right after the text appears is saved", async ({ page }) => {
	await reopenDeep(page);
	await reader.waitRevealed(page);
	const from = await saveLogLength(page);

	await reader.wheel(page, 400);
	expect(await settleSaveAfter(page, from)).toBe(await reader.scrollModeTopWord(page));
});

test("a page key right after the text appears is saved", async ({ page }) => {
	await reopenDeep(page);
	await reader.waitRevealed(page);
	const from = await saveLogLength(page);

	await page.keyboard.press("PageDown");
	expect(await settleSaveAfter(page, from)).toBe(await reader.scrollModeTopWord(page));
});
