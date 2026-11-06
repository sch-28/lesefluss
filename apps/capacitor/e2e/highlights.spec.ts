import { expect, type Page, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

async function reopen(page: Page, title: string) {
	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);
}

test("a highlight's create, colour, note and delete each persist across a reload", async ({
	page,
}) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await reader.selectWords(page, "opening", "paragraph");
	const wordPosition = await reader.applyHighlight(page, "yellow");
	expect(wordPosition).toBeGreaterThan(0);
	await reopen(page, title);
	await reader.expectHighlight(page, wordPosition, "yellow");

	await reader.openHighlightEditor(page, wordPosition);
	await reader.changeHighlightColorFromEditor(page, "blue");
	await reader.expectHighlight(page, wordPosition, "blue");
	await reader.dismissSelection(page);

	const noteText = "spec-fixture-note-marker";
	await reader.openHighlightEditor(page, wordPosition);
	await reader.setHighlightNoteFromEditor(page, noteText);
	await page.keyboard.press("Escape");

	await reopen(page, title);
	await reader.expectHighlight(page, wordPosition, "blue");
	await reader.openHighlightEditor(page, wordPosition);
	await expect(await reader.openHighlightNote(page)).toHaveValue(noteText);
	await page.keyboard.press("Escape");

	await reopen(page, title);
	await reader.openHighlightEditor(page, wordPosition);
	await reader.deleteHighlightFromEditor(page);
	await reader.expectNoHighlight(page, wordPosition);
	await reopen(page, title);
	await reader.expectNoHighlight(page, wordPosition);
});
