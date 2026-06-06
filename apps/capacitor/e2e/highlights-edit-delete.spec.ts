import { test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

test("highlight color edit persists across reload", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await reader.selectWords(page, "opening", "paragraph");
	const wordPosition = await reader.applyHighlight(page, "yellow");
	await reader.cancelSelection(page);

	// Reopen editor on the same word, switch to blue.
	await reader.openHighlightEditor(page, wordPosition);
	await reader.changeHighlightColorFromEditor(page, "blue");

	await reader.expectHighlight(page, wordPosition, "blue");

	// Reload via library round-trip; DB row must reflect blue now.
	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);
	await reader.expectHighlight(page, wordPosition, "blue");
});

test("highlight delete persists across reload", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await reader.selectWords(page, "opening", "paragraph");
	const wordPosition = await reader.applyHighlight(page, "yellow");
	await reader.cancelSelection(page);

	await reader.openHighlightEditor(page, wordPosition);
	await reader.deleteHighlightFromEditor(page);

	await reader.expectNoHighlight(page, wordPosition);

	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);
	await reader.expectNoHighlight(page, wordPosition);
});
