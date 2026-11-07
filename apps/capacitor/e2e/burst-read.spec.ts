import { expect, type Page, test } from "@playwright/test";
import { CHAPTER_NOVEL_TITLE, seedChapterNovel } from "./helpers/chapter-novel";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Burst read where the browser has no Document Picture-in-Picture: the strip
 * floats in the tab, plays the last-read book from its saved word at once, and
 * a look away pauses, saves and pushes the shown word, shows the summary and
 * shrinks to the pill. The RSVP/Text switch keeps the word and is remembered.
 */

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		delete (window as { documentPictureInPicture?: unknown }).documentPictureInPicture;
	});
});

const strip = (page: Page) => page.getByTestId("burst-strip");
const stripWord = async (page: Page) => Number(await strip(page).getAttribute("data-word"));
const isPlaying = async (page: Page) => (await strip(page).getAttribute("data-playing")) === "true";
const pushRequests = (page: Page) =>
	page.evaluate(() => window.__lesefluss_e2e_syncPushRequests ?? 0);

async function runBurstFromPalette(page: Page) {
	await reader.blurFocusedControl(page);
	await page.keyboard.press("Control+k");
	const palette = page.getByTestId("command-palette");
	await expect(palette).toBeVisible();
	await palette.getByRole("combobox").fill("burst read");
	await expect(palette.getByRole("option").first()).toContainText("Burst read");
	await page.keyboard.press("Enter");
	await expect(palette).toBeHidden();
}

/** Reads a little way into the novel, leaves the reader and returns the saved word. */
async function readThenLeave(page: Page) {
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	const saved = reader.waitForNextSave(page);
	await reader.wheel(page, 2400);
	await saved;
	await reader.waitPositionQuiet(page);
	const word = await reader.lastSavedWord(page);
	const bookId = await reader.leaveFlushed(page);
	return { bookId, word };
}

const lookAway = (page: Page) =>
	page.evaluate(() =>
		document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })),
	);

test("with no book read yet, the strip says to open a book first", async ({ page }) => {
	await seedChapterNovel(page);
	await runBurstFromPalette(page);
	await expect(page.getByTestId("burst-empty")).toContainText("Open a book in Lesefluss first");
	await expect(strip(page)).toHaveCount(0);
});

test("plays the last-read book from its saved word; a look away pauses, saves, pushes and shrinks to the pill", async ({
	page,
}) => {
	const { bookId, word } = await readThenLeave(page);

	await runBurstFromPalette(page);
	await expect(strip(page)).toBeVisible();
	await expect(strip(page)).toHaveAttribute("data-mode", "rsvp");
	await expect.poll(() => isPlaying(page), "RSVP plays at once").toBe(true);
	expect(await stripWord(page), "it starts at the saved word").toBeGreaterThanOrEqual(word);
	expect(await stripWord(page)).toBeLessThan(word + 20);

	await page.keyboard.press("Space");
	await expect.poll(() => isPlaying(page), "Space pauses").toBe(false);
	// Past the engine's double-tap debounce: a second press inside it is dropped.
	await page.waitForTimeout(150);
	await page.keyboard.press("Space");
	await expect.poll(() => isPlaying(page)).toBe(true);
	await expect.poll(() => stripWord(page)).toBeGreaterThan(word + 2);

	const pushes = await pushRequests(page);
	await lookAway(page);
	const summary = page.getByTestId("burst-summary");
	await expect(summary).toContainText(/\+\d+ words/);
	await expect(summary).toContainText("saved");
	const shown = await stripWord(page);
	expect(await isPlaying(page)).toBe(false);
	await expect.poll(async () => (await reader.savedRow(page, bookId))?.wordPosition).toBe(shown);
	expect(await pushRequests(page), "the save is pushed").toBeGreaterThan(pushes);

	await expect(page.getByTestId("burst-pill")).toBeVisible({ timeout: 3000 });
	await expect(strip(page)).toHaveCount(0);
});

test("Text keeps the word and does not play, and the mode is remembered", async ({ page }) => {
	await readThenLeave(page);
	await runBurstFromPalette(page);
	await expect.poll(() => isPlaying(page)).toBe(true);
	await page.keyboard.press("Space");
	await expect.poll(() => isPlaying(page)).toBe(false);
	const word = await stripWord(page);

	const modes = strip(page).getByRole("group", { name: "Reading mode" });
	await modes.getByRole("button", { name: "Text" }).click();
	await expect(strip(page)).toHaveAttribute("data-mode", "text");
	expect(await stripWord(page)).toBe(word);
	await expect(strip(page).locator(`[data-word="${word}"]`)).toBeVisible();
	await page.waitForTimeout(500);
	expect(await isPlaying(page), "Text never plays").toBe(false);
	expect(await stripWord(page)).toBe(word);

	await strip(page).getByRole("button", { name: "Close burst read" }).click();
	await expect(strip(page)).toHaveCount(0);
	await runBurstFromPalette(page);
	await expect(strip(page)).toHaveAttribute("data-mode", "text");
	await page.waitForTimeout(500);
	expect(await isPlaying(page)).toBe(false);
});
