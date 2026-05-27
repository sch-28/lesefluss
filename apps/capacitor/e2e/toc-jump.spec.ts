import { expect, test } from "@playwright/test";
import { reader } from "./page-objects/reader";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

/**
 * TOC sheet must list every chapter the parser emitted and jumping must move
 * the reader to that chapter's content. Position-restore covers durable
 * correctness across close+reopen; this test covers the in-session TOC UX.
 */
test("TOC sheet lists chapters and jumping lands on the chapter heading", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await page.getByRole("button", { name: "Annotations" }).click();
	for (const label of ["1: First", "2: Second"]) {
		await expect(page.getByRole("button", { name: label })).toBeVisible();
	}

	await page.getByRole("button", { name: "2: Second" }).click();

	// Sheet auto-closes on selection (toBeHidden alone would vacuously pass if
	// the chapter button never existed; assert via count after the click).
	await expect(page.getByRole("button", { name: "1: First" })).toHaveCount(0);
	await expect(page.locator("h2", { hasText: "TITLE 2" })).toBeInViewport({ timeout: 5000 });

	// Hop back to chapter 1 to confirm the sheet still works after a jump.
	await reader.tocJumpToChapter(page, "1: First");
	await expect(page.locator("h2", { hasText: "TITLE 1" })).toBeInViewport({ timeout: 5000 });
});
