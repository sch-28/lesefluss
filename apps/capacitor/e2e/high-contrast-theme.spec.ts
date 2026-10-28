import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, openBigBookInPageMode, seedBigBook } from "./helpers/big-book";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

const PHONE = { width: 420, height: 900 };
const SETTLE_MS = 2000;

async function chooseHighContrast(page: Page) {
	await reader.openAppearance(page);
	await page.getByRole("radio", { name: "High contrast" }).click();
	await page.keyboard.press("Escape");
	await expect(page.locator(".appearance-popover-content")).toHaveCount(0);
	await expect(page.locator("html")).toHaveClass(/\bhigh-contrast\b/);
}

/** Every rendered word's box on screen: identical before and after means nothing reflowed. */
async function wordBoxes(page: Page): Promise<string> {
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>("span[data-word]")]
			.map((span) => {
				const r = span.getBoundingClientRect();
				return `${span.dataset.word}:${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}`;
			})
			.join(";"),
	);
}

/**
 * High contrast changes colours only. The page-mode layout cache does not key
 * on the theme, so a theme that moved a single glyph would leave pagination
 * stale; these two check the text does not move and nothing is saved.
 */
test("switching to high contrast mid-chapter in scroll mode moves no text and saves nothing", async ({
	page,
}) => {
	await page.setViewportSize(PHONE);
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	const savePending = reader.waitForNextSave(page);
	await reader.wheel(page, 2500);
	await savePending;
	const word = await reader.scrollModeTopWord(page);
	const saves = await reader.saveRequestCount(page);
	const before = await wordBoxes(page);

	await chooseHighContrast(page);
	await page.waitForTimeout(SETTLE_MS);

	expect(await wordBoxes(page)).toBe(before);
	expect(await reader.scrollModeTopWord(page)).toBe(word);
	expect(await reader.lastSavedWord(page)).toBe(word);
	expect(await reader.saveRequestCount(page)).toBe(saves);
});

test("switching to high contrast mid-chapter in page mode keeps the page and saves nothing", async ({
	page,
}) => {
	await page.setViewportSize(PHONE);
	await openBigBookInPageMode(page);
	await reader.turnPages(page, 5);
	const word = await reader.pageModeFirstVisibleWord(page);
	const saves = await reader.saveRequestCount(page);
	const before = await wordBoxes(page);

	await chooseHighContrast(page);
	await page.waitForTimeout(SETTLE_MS);

	expect(await reader.pageModeFirstVisibleWord(page)).toBe(word);
	expect(await wordBoxes(page)).toBe(before);
	expect(await reader.saveRequestCount(page)).toBe(saves);
});

test("high contrast paints white on black with its yellow accent and highlight underlines", async ({
	page,
}) => {
	await page.setViewportSize(PHONE);
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await chooseHighContrast(page);

	await expect(page.locator("html")).toHaveClass(/\bdark\b/);
	const painted = await page.evaluate(() => {
		const span = document.querySelector<HTMLElement>("span[data-word]");
		const readerRoot = document.querySelector(".reader-theme-high-contrast");
		if (!span || !readerRoot) throw new Error("reader not rendered");
		// The rule under test, on a word that need not be highlighted through the UI.
		span.classList.add("word-highlight-yellow");
		const result = {
			text: getComputedStyle(span).color,
			highlightShadow: getComputedStyle(span).boxShadow,
			body: getComputedStyle(document.body).backgroundColor,
			primary: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
			readerText: getComputedStyle(readerRoot).getPropertyValue("--reader-text").trim(),
		};
		span.classList.remove("word-highlight-yellow");
		return result;
	});
	expect(painted).toEqual({
		text: "rgb(255, 255, 255)",
		highlightShadow: "rgb(255, 235, 59) 0px -2px 0px 0px inset",
		body: "rgb(0, 0, 0)",
		primary: "#ffd60a",
		readerText: "#ffffff",
	});
});

test("a restart paints high contrast from the first frame", async ({ page }) => {
	await page.setViewportSize(PHONE);
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await chooseHighContrast(page);

	// "interactive" comes after the inline head script and before any module
	// script runs, so only index.html's own first paint has set classes by then.
	await page.addInitScript(() => {
		document.addEventListener("readystatechange", () => {
			if (document.readyState !== "interactive") return;
			(window as { __firstPaintClasses?: string }).__firstPaintClasses =
				document.documentElement.className;
		});
	});
	await page.reload();
	const classes = await page.evaluate(
		() => (window as { __firstPaintClasses?: string }).__firstPaintClasses ?? "",
	);
	expect(classes).toMatch(/\bdark\b/);
	expect(classes).toMatch(/\bhigh-contrast\b/);
});
