import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader, stepperValue } from "./page-objects/reader";

/**
 * Reader appearance settings live in the `settings` table; the reader reads
 * them via `queryHooks.useSettings` on mount. A font-size bump must survive a
 * reload via that table, not just in-session state.
 */
test("font-size adjustment persists across a reload", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	// Open appearance popover, capture starting size, bump twice (step=2 → +4 px).
	await reader.openAppearance(page);
	const sizeLabel = stepperValue(page, "Text size");
	await expect(sizeLabel).toBeVisible();
	const startText = await sizeLabel.textContent();
	const startSize = Number.parseInt((startText ?? "0").replace("px", ""), 10);
	expect(startSize).toBeGreaterThan(0);

	const plus = page.getByRole("button", { name: "Increase Text size" });
	await plus.click();
	await expect(sizeLabel).toHaveText(`${startSize + 2}px`);
	await plus.click();
	await expect(sizeLabel).toHaveText(`${startSize + 4}px`);
	const afterSize = startSize + 4;

	await page.keyboard.press("Escape");

	// Library round-trip rehydrates the reader from DB.
	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);

	await reader.openAppearance(page);
	await expect(stepperValue(page, "Text size")).toHaveText(`${afterSize}px`);
});

test("the appearance popover still closes after changing pagination or a switch", async ({
	page,
}) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	const popover = page.locator(".appearance-popover-content");

	await reader.openAppearance(page);
	await popover.getByRole("button", { name: "Page", exact: true }).click();
	await page.keyboard.press("Escape");
	await expect(popover).toHaveCount(0);

	await reader.openAppearance(page);
	await page.getByRole("switch", { name: "Bold text" }).click();
	await page.mouse.click(10, 400);
	await expect(popover).toHaveCount(0);
});
