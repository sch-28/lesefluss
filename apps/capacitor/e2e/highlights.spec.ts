import { expect, test } from "@playwright/test";
import { reader } from "./page-objects/reader";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

test("creates a highlight that persists across a reload", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await reader.selectWords(page, "opening", "paragraph");
	const wordPosition = await reader.applyHighlight(page, "yellow");
	expect(wordPosition).toBeGreaterThan(0);

	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);
	await reader.expectHighlight(page, wordPosition, "yellow");
});
