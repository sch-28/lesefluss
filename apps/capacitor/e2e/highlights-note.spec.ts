import { expect, test } from "@playwright/test";
import { reader } from "./page-objects/reader";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

test("highlight note text persists across reload", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await reader.selectWords(page, "opening", "paragraph");
	const wordPosition = await reader.applyHighlight(page, "yellow");
	await reader.cancelSelection(page);

	const noteText = "spec-fixture-note-marker";
	await reader.openHighlightEditor(page, wordPosition);
	await reader.setHighlightNoteFromEditor(page, noteText);
	await page.keyboard.press("Escape");

	// Reload + reopen editor; the textarea must contain the same note.
	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);
	await reader.openHighlightEditor(page, wordPosition);
	await expect(page.getByPlaceholder("Add a note…")).toHaveValue(noteText);
});
