import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

/**
 * Reader appearance settings live in the `settings` table; the reader reads
 * them via `queryHooks.useSettings` on mount. A font-size bump must survive a
 * reload via that table, not just in-session state.
 */
test("font-size adjustment persists across a reload", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	// Open appearance popover, capture starting size, bump twice (step=2 → +4 px).
	await page.getByRole("button", { name: "Appearance settings" }).click();
	const sizeLabel = page.locator(".ap-row-value", { hasText: /^\d+px$/ }).first();
	const startText = await sizeLabel.textContent();
	const startSize = Number.parseInt((startText ?? "0").replace("px", ""), 10);
	expect(startSize).toBeGreaterThan(0);

	const plus = page.getByRole("button", { name: "A+" });
	await plus.click();
	await expect(sizeLabel).toHaveText(`${startSize + 2}px`);
	await plus.click();
	await expect(sizeLabel).toHaveText(`${startSize + 4}px`);
	const afterSize = startSize + 4;

	await page.keyboard.press("Escape");

	// Library round-trip rehydrates the reader from DB.
	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);

	await page.getByRole("button", { name: "Appearance settings" }).click();
	const restoredText = await page
		.locator(".ap-row-value", { hasText: /^\d+px$/ })
		.first()
		.textContent();
	const restoredSize = Number.parseInt((restoredText ?? "0").replace("px", ""), 10);
	expect(restoredSize).toBe(afterSize);
});
