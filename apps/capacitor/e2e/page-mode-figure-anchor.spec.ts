import { expect, type Page, test } from "@playwright/test";
import { openBigBookInPageMode } from "./helpers/big-book";
import { reader } from "./page-objects/reader";

/**
 * A page-sized figure owns its page. Re-anchoring after a rotation or a font
 * step must not land before it: the settle on the figure page leaves the
 * position on the previous text page, which is exactly the trap.
 */

const PORTRAIT = { width: 420, height: 900 };
const LANDSCAPE = { width: 900, height: 420 };
const MAX_PAGE_TURNS = 60;
const PAGE_TURN_SETTLE_MS = 500;

async function turnUntilFigureVisible(page: Page, figureAlt: string): Promise<void> {
	const figure = page.locator(`.reader-figure img[alt="${figureAlt}"]`);
	await reader.blurFocusedControl(page);
	for (let turn = 0; turn < MAX_PAGE_TURNS && !(await figure.isVisible()); turn++) {
		await page.keyboard.press("ArrowRight");
		await page.waitForTimeout(PAGE_TURN_SETTLE_MS);
	}
	await expect(figure).toBeVisible();
}

/** The reader is on the figure's page or a later one, never an earlier one. */
async function expectNotBefore(page: Page, figureAlt: string, position: number): Promise<void> {
	await expect
		.poll(
			async () => {
				if (await page.locator(`.reader-figure img[alt="${figureAlt}"]`).isVisible()) return true;
				const words = await reader.pageModeVisibleWords(page);
				return words.length > 0 && words[0] >= position;
			},
			{ timeout: 5000 },
		)
		.toBe(true);
}

test("rotating on a page-sized figure never lands on an earlier page", async ({ page }) => {
	await page.setViewportSize(PORTRAIT);
	await openBigBookInPageMode(page);
	await turnUntilFigureVisible(page, "Figure 30");
	const position = (await reader.saveCount(page)) === 0 ? 0 : await reader.lastSavedWord(page);
	const saveCountBefore = await reader.saveCount(page);

	await page.setViewportSize(LANDSCAPE);
	await expectNotBefore(page, "Figure 30", position);
	await expect(reader.waitForSaveAbove(page, saveCountBefore, 1500)).rejects.toThrow();

	await page.setViewportSize(PORTRAIT);
	await expectNotBefore(page, "Figure 30", position);
});

test("a font-size step on a page-sized figure never lands on an earlier page", async ({ page }) => {
	await page.setViewportSize(PORTRAIT);
	await openBigBookInPageMode(page);
	await turnUntilFigureVisible(page, "Figure 30");
	const position = (await reader.saveCount(page)) === 0 ? 0 : await reader.lastSavedWord(page);

	await reader.increaseFontSize(page);
	await expectNotBefore(page, "Figure 30", position);
});
