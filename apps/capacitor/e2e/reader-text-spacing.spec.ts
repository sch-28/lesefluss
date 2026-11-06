import { SETTING_CONSTRAINTS, type SyncSettings } from "@lesefluss/core";
import { expect, type Page, test } from "@playwright/test";
import { PLAIN_BOOK_TITLE, plainBookFixture } from "./helpers/plain-book";
import { applyRemoteSettings } from "./helpers/remote-settings";
import { openBookFromLibrary, seedFixture, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Letter and word spacing widen the text without touching the word spans, so
 * everything placed by a word's own box (taps, selection, highlights, the
 * active-word underline) still has to land on the word under the pointer.
 */

const MAX_SPACING: Partial<SyncSettings> = {
	readerLetterSpacing: SETTING_CONSTRAINTS.READER_LETTER_SPACING.max,
	readerWordSpacing: SETTING_CONSTRAINTS.READER_WORD_SPACING.max,
	readerParagraphSpacing: SETTING_CONSTRAINTS.READER_PARAGRAPH_SPACING.max,
};

async function openAtMaxSpacing(page: Page) {
	const title = await seedStrayAnchorBook(page);
	await applyRemoteSettings(page, MAX_SPACING);
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	await expect
		.poll(() =>
			page.evaluate(() => {
				const p = document.querySelector(".reader-paragraph");
				return p ? getComputedStyle(p).letterSpacing : "";
			}),
		)
		.not.toMatch(/^(normal|0px)$/);
}

test("at the widest spacing, a drag highlights exactly the words it spans", async ({ page }) => {
	await openAtMaxSpacing(page);
	const first = await reader.wordPositionOf(page, "opening");
	const last = await reader.wordPositionOf(page, "paragraph");

	await reader.selectWords(page, "opening", "paragraph");
	await reader.applyHighlight(page, "yellow");

	for (let word = first; word <= last; word++) await reader.expectHighlight(page, word, "yellow");
	await reader.expectNoHighlight(page, first - 1);
	await reader.expectNoHighlight(page, last + 1);
});

test("at the widest spacing, a tap on a word marks and saves that word", async ({ page }) => {
	await openAtMaxSpacing(page);
	const span = page.locator("span[data-word]").nth(12);
	const word = await reader.wordPositionIn(span);

	await span.click();

	await expect(span).toHaveClass(/word-active/);
	await reader.waitPositionQuiet(page);
	expect(await reader.lastSavedWord(page)).toBe(word);
});

test.describe("page mode", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 420, height: 900 });
		await seedFixture(page, plainBookFixture(), "plain.epub");
		await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
		await reader.expectLoaded(page);
		await reader.setPaginationStyle(page, "page");
		await reader.turnPages(page, 5);
	});

	test("the widest spacing pulled in by sync keeps the current word on screen, saves nothing, and turns on from there", async ({
		page,
	}) => {
		const word = await reader.pageModeFirstVisibleWord(page);
		await reader.waitPositionQuiet(page);
		const saves = await reader.saveRequestCount(page);
		const pageBefore = (await reader.pageModeVisibleWords(page)).join();

		await applyRemoteSettings(page, MAX_SPACING);

		await expect
			.poll(async () => (await reader.pageModeVisibleWords(page)).join())
			.not.toBe(pageBefore);
		await reader.expectWordVisibleInPage(page, word);
		await reader.waitPositionQuiet(page);
		expect(await reader.saveRequestCount(page), "a layout change saves nothing").toBe(saves);

		// The page index follows the new layout: a turn saves the page it shows.
		await reader.turnPages(page, 1);
		const turned = await reader.pageModeFirstVisibleWord(page);
		expect(await reader.lastSavedWord(page)).toBe(turned);

		await reader.leaveFlushed(page);
		await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
		await reader.expectLoaded(page);
		await reader.expectWordVisibleInPage(page, turned);
	});
});

test("Reset spacing puts all three back to their defaults in one go", async ({ page }) => {
	await seedFixture(page, plainBookFixture(), "plain.epub");
	await openBookFromLibrary(page, PLAIN_BOOK_TITLE);
	await reader.expectLoaded(page);
	for (const label of ["Letter spacing", "Word spacing", "Paragraph spacing"]) {
		await reader.stepUpAppearance(page, label);
	}

	await reader.openAppearance(page);
	await page.getByRole("button", { name: "Reset spacing" }).click();

	for (const label of ["Letter spacing", "Word spacing", "Paragraph spacing"]) {
		await expect(
			page.locator(".ap-row").filter({ hasText: label }).locator(".ap-row-value"),
		).toHaveText("Default");
	}
	expect(
		await page.evaluate(() => {
			const p = document.querySelector(".reader-paragraph");
			return p ? getComputedStyle(p).letterSpacing : "";
		}),
	).toBe("normal");
});
