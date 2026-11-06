import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, seedBigBook } from "./helpers/big-book";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

const PHONE = { width: 420, height: 900 };

async function chooseHighContrast(page: Page) {
	await reader.openAppearance(page);
	await page.getByRole("radio", { name: "High contrast" }).click();
	await page.keyboard.press("Escape");
	await expect(page.locator(".appearance-popover-content")).toHaveCount(0);
	await expect(page.locator("html")).toHaveClass(/\bhigh-contrast\b/);
}

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
