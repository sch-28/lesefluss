import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, openBigBookInPageMode, seedBigBook } from "./helpers/big-book";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

const PHONE = { width: 420, height: 900 };
/** A two-page spread, as in page-mode-spread.spec. */
const SPREAD = { width: 1280, height: 800 };
const SETTLE_MS = 2000;

const ruler = (page: Page) => page.locator(".reading-ruler");
const band = (page: Page) => page.locator(".reading-ruler-band");

/** An Off/On row of the appearance popover, queried like the popover's other rows. */
async function setPopoverSwitch(page: Page, row: string, on: boolean) {
	await reader.openAppearance(page);
	await page
		.locator(".ap-row")
		.filter({ hasText: row })
		.getByRole("radio", { name: on ? "On" : "Off" })
		.click();
	await page.keyboard.press("Escape");
	await expect(page.locator(".appearance-popover-content")).toHaveCount(0);
}

const setRuler = (page: Page, on: boolean) => setPopoverSwitch(page, "Reading ruler", on);

/** Every rendered word's box: identical before and after means nothing reflowed or moved. */
async function wordBoxes(page: Page): Promise<string> {
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>("span[data-word]")]
			.map((span) => {
				const r = span.getBoundingClientRect();
				return `${span.dataset.word}:${Math.round(r.left)},${Math.round(r.top)}`;
			})
			.join(";"),
	);
}

/** Whether the visible band covers `word`'s line on screen. */
async function bandCoversWord(page: Page, word: number): Promise<boolean> {
	return page.evaluate((word) => {
		const root = document.querySelector<HTMLElement>(".reading-ruler");
		const bandEl = document.querySelector(".reading-ruler-band");
		const span = document.querySelector(`span[data-word="${word}"]`);
		if (!root || root.dataset.visible !== "true" || !bandEl || !span) return false;
		const b = bandEl.getBoundingClientRect();
		const clip = (document.querySelector(".page-clip") ?? root).getBoundingClientRect();
		const rects = [...span.getClientRects()].filter((r) => {
			const x = (r.left + r.right) / 2;
			return x >= clip.left && x <= clip.right;
		});
		return rects.some((r) => r.top >= b.top - 1 && r.bottom <= b.bottom + 1);
	}, word);
}

/** Starts recording whether the ruler hides; read with `wasRulerHidden`. */
async function recordRulerHidden(page: Page) {
	await page.evaluate(() => {
		const root = document.querySelector<HTMLElement>(".reading-ruler");
		if (!root) throw new Error("no ruler");
		(window as { __rulerHidden?: boolean }).__rulerHidden = false;
		new MutationObserver(() => {
			if (root.dataset.visible === "false")
				(window as { __rulerHidden?: boolean }).__rulerHidden = true;
		}).observe(root, { attributes: true, attributeFilter: ["data-visible"] });
	});
}

const wasRulerHidden = (page: Page) =>
	page.evaluate(() => (window as { __rulerHidden?: boolean }).__rulerHidden === true);

async function openScrollMidChapter(page: Page) {
	await page.setViewportSize(PHONE);
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	const savePending = reader.waitForNextSave(page);
	await reader.wheel(page, 2500);
	await savePending;
	await reader.waitPositionQuiet(page);
	return reader.scrollModeTopWord(page);
}

test("toggling the ruler mid-chapter in scroll mode moves nothing and saves nothing", async ({
	page,
}) => {
	const word = await openScrollMidChapter(page);
	const saves = await reader.saveRequestCount(page);
	const before = await wordBoxes(page);

	await setRuler(page, true);
	await expect(band(page)).toBeVisible();
	await page.waitForTimeout(SETTLE_MS);
	await setRuler(page, false);
	await expect(ruler(page)).toHaveCount(0);
	await page.waitForTimeout(SETTLE_MS);

	expect(await wordBoxes(page)).toBe(before);
	expect(await reader.lastSavedWord(page)).toBe(word);
	expect(await reader.saveRequestCount(page)).toBe(saves);
});

test("toggling the ruler mid-chapter in page mode keeps the page and saves nothing", async ({
	page,
}) => {
	await page.setViewportSize(PHONE);
	await openBigBookInPageMode(page);
	await reader.turnPages(page, 5);
	await reader.waitPositionQuiet(page);
	const word = await reader.pageModeFirstVisibleWord(page);
	const saved = await reader.lastSavedWord(page);
	const saves = await reader.saveRequestCount(page);
	const before = await wordBoxes(page);

	await setRuler(page, true);
	await expect(band(page)).toBeVisible();
	await page.waitForTimeout(SETTLE_MS);
	await setRuler(page, false);
	await page.waitForTimeout(SETTLE_MS);

	expect(await reader.pageModeFirstVisibleWord(page)).toBe(word);
	expect(await wordBoxes(page)).toBe(before);
	expect(await reader.lastSavedWord(page)).toBe(saved);
	expect(await reader.saveRequestCount(page)).toBe(saves);
});

test("taps and long presses reach the words under the ruler", async ({ page }) => {
	await openScrollMidChapter(page);
	await setRuler(page, true);
	const word = (await reader.scrollModeTopWord(page)) + 40;
	const span = page.locator(`span[data-word="${word}"]`);
	await span.click();
	await expect.poll(() => bandCoversWord(page, word)).toBe(true);
	const hit = await page.evaluate((word) => {
		const r = document.querySelector(`span[data-word="${word}"]`)?.getBoundingClientRect();
		if (!r) return null;
		const el = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
		return el instanceof HTMLElement ? (el.dataset.word ?? el.className) : null;
	}, word);
	expect(hit).toBe(String(word));

	await reader.touchLongPressOn(page, span);
	await expect(span).toHaveClass(/word-selecting/);
	await expect(reader.selectionToolbar(page)).toBeVisible();
});

test("in page mode the ruler hides while the page slides and returns on the settled page", async ({
	page,
}) => {
	await page.setViewportSize(PHONE);
	await openBigBookInPageMode(page);
	await setRuler(page, true);
	await expect(ruler(page)).toHaveAttribute("data-visible", "true");
	const before = await reader.pageModeFirstVisibleWord(page);

	// The popover hands focus back to its trigger, which swallows arrow keys.
	await reader.blurFocusedControl(page);
	await recordRulerHidden(page);
	await page.keyboard.press("ArrowRight");
	await reader.waitPositionQuiet(page);

	expect(await reader.pageModeFirstVisibleWord(page)).not.toBe(before);
	expect(await wasRulerHidden(page)).toBe(true);
	await expect(ruler(page)).toHaveAttribute("data-visible", "true");
});

test("in a two-page spread the band marks one page only", async ({ page }) => {
	await page.setViewportSize(SPREAD);
	await openBigBookInPageMode(page);
	await setRuler(page, true);
	await expect(ruler(page)).toHaveAttribute("data-visible", "true");
	const clipWidth = await page
		.locator(".page-clip")
		.evaluate((el) => el.getBoundingClientRect().width);
	const bandWidth = (await band(page).boundingBox())?.width ?? 0;
	expect(bandWidth).toBeGreaterThan(0);
	expect(bandWidth).toBeLessThan(clipWidth * 0.6);
});

test("reopening after using the ruler in page mode restores the same first word", async ({
	page,
}) => {
	await page.setViewportSize(PHONE);
	await openBigBookInPageMode(page);
	await reader.turnPages(page, 3);
	await reader.waitPositionQuiet(page);
	const word = await reader.pageModeFirstVisibleWord(page);

	await setRuler(page, true);
	await reader.stepUpAppearance(page, "Ruler lines");
	await expect(band(page)).toBeVisible();

	await reader.leaveFlushed(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await expect.poll(() => reader.pageModeFirstVisibleWord(page), { timeout: 10_000 }).toBe(word);
});
