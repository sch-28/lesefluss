import { expect, test } from "@playwright/test";
import { reader } from "./page-objects/reader";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

test("reader restores saved word position after closing and reopening the book", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);

	await openBookFromLibrary(page, title);
	await expect(page.locator("body")).toContainText("Chapter 1 opening paragraph anchors the scene.");

	// Jump to chapter 2 via TOC. savePosition() writes books.wordPosition.
	const savePending = reader.waitForNextSave(page);
	await reader.tocJumpToChapter(page, "2: Second");
	await expect(page.locator("h2", { hasText: "TITLE 2" })).toBeInViewport({ timeout: 5000 });
	await savePending;

	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);

	const ch2 = page.locator("body").getByText("Chapter 2 opening paragraph anchors the scene.");
	await expect(ch2).toBeVisible({ timeout: 10_000 });
	await expect(ch2).toBeInViewport();
});
