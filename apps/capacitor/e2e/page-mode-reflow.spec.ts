import { expect, type Page, test } from "@playwright/test";
import { FULL_PAGE_FIGURE_BEFORE, openBigBookInPageMode } from "./helpers/big-book";
import { reader } from "./page-objects/reader";

/**
 * A rotation, a height-only resize or a font step changes the column geometry,
 * so a page index means nothing afterwards: page 6 of a portrait layout holds
 * other words than page 6 of a landscape one. The reader must stay anchored to
 * the word the user was on, and the reflow alone must save nothing.
 *
 * Android keeps the Activity alive across a rotation (`android:configChanges`
 * covers `orientation|screenSize`), so the WebView is resized in place;
 * `setViewportSize` reproduces that. Phone-sized on purpose: a page of a few
 * hundred words shifts noticeably on a reflow, a desktop page keeps the word by luck.
 */

const PORTRAIT = { width: 420, height: 900 };
// A phone in landscape stays below the 900px spread breakpoint: one page.
const LANDSCAPE = { width: 860, height: 420 };
const FIGURE_ALT = `Figure ${FULL_PAGE_FIGURE_BEFORE}`;

async function openFivePagesIn(page: Page) {
	await page.setViewportSize(PORTRAIT);
	await openBigBookInPageMode(page);
	// Well away from page 0, so a stale page index lands on obviously other text.
	await reader.turnPages(page, 5);
	return reader.pageModeFirstVisibleWord(page);
}

/**
 * Lands on the page the tall figure owns through a position from another device,
 * instead of turning there one slide at a time. Returns the first word after it.
 */
async function openOnFigurePage(page: Page) {
	await page.setViewportSize(PORTRAIT);
	await openBigBookInPageMode(page);
	await reader.waitPositionQuiet(page);
	const afterFigure = await page.evaluate((n) => {
		const spans = [...document.querySelectorAll<HTMLElement>("span[data-word]")];
		const start = spans.find(
			(s, i) =>
				s.textContent?.trim() === "Paragraph" && spans[i + 1]?.textContent?.trim() === `${n}`,
		);
		if (!start) throw new Error(`No rendered Paragraph ${n}`);
		return Number(start.dataset.word);
	}, FULL_PAGE_FIGURE_BEFORE);
	const id = reader.bookIdFromUrl(page);
	await page.evaluate(
		([id, word]) =>
			window.__lesefluss_e2e_remotePosition?.(id as string, word as number, Date.now()),
		[id, afterFigure] as const,
	);
	await reader.expectWordVisibleInPage(page, afterFigure);
	// The 10s "moved to where you left off" toast sits over the header's More button.
	await page.addStyleTag({
		content: "[data-sonner-toaster], [data-sonner-toast] { pointer-events: none !important; }",
	});
	await reader.waitPositionQuiet(page);
	await reader.blurFocusedControl(page);
	const figure = page.locator(`.reader-figure img[alt="${FIGURE_ALT}"]`);
	if (!(await figure.isVisible())) await page.keyboard.press("ArrowLeft");
	await expect(figure).toBeVisible();
	await reader.waitPositionQuiet(page);
	return afterFigure;
}

/** The reader is on the figure's page or a later one, never an earlier one. */
async function expectNotBefore(page: Page, afterFigure: number) {
	await expect
		.poll(
			async () => {
				if (await page.locator(`.reader-figure img[alt="${FIGURE_ALT}"]`).isVisible()) return true;
				const words = await reader.pageModeVisibleWords(page);
				return words.length > 0 && words[0] >= afterFigure;
			},
			{ timeout: 5000 },
		)
		.toBe(true);
}

test("rotating keeps the current word on screen and saves nothing", async ({ page }) => {
	const word = await openFivePagesIn(page);
	await reader.waitPositionQuiet(page);
	const saved = await reader.lastSavedWord(page);

	await reader.expectNoSaveDuring(page, async () => {
		await page.setViewportSize(LANDSCAPE);
		await reader.expectWordVisibleInPage(page, word);
		await page.setViewportSize(PORTRAIT);
		await reader.expectWordVisibleInPage(page, word);
	});
	expect(await reader.lastSavedWord(page)).toBe(saved);
});

/**
 * A height-only resize (Android keyboard, system bars appearing) reflows the
 * columns without changing `pageWidth`. A chunk's measured width is quantised to
 * whole columns, so every value the lander watches can stay identical while each
 * page boundary moves: the re-anchor has to follow the layout inputs themselves.
 */
test("a height-only resize keeps the current word on screen", async ({ page }) => {
	const word = await openFivePagesIn(page);

	await page.setViewportSize({ width: PORTRAIT.width, height: 640 });
	await reader.expectWordVisibleInPage(page, word);
});

test("bumping the font size keeps the current word on screen", async ({ page }) => {
	const word = await openFivePagesIn(page);

	await reader.increaseFontSize(page);
	await reader.increaseFontSize(page);

	await reader.expectWordVisibleInPage(page, word);
});

/**
 * A page-sized figure owns its page. The settle on that page leaves the
 * position on the previous text page, so a re-anchor after a rotation or a font
 * step can fall back before the figure: exactly the trap.
 */
test("on a page-sized figure, a rotation and a font step never land on an earlier page", async ({
	page,
}) => {
	const afterFigure = await openOnFigurePage(page);

	await reader.expectNoSaveDuring(page, async () => {
		await page.setViewportSize({ width: 900, height: 420 });
		await expectNotBefore(page, afterFigure);
		await page.setViewportSize(PORTRAIT);
		await expectNotBefore(page, afterFigure);
	});

	await reader.increaseFontSize(page);
	await expectNotBefore(page, afterFigure);
});
