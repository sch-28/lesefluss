import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

test("annotations sheet lists highlights ordered by ascending startWord", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	// Create the LATER highlight first (Chapter 1 sixth paragraph) so its
	// insert-order ≠ word-order; the sheet must still sort by startWord.
	await reader.selectWords(page, "sixth", "completely.");
	await reader.applyHighlight(page, "yellow");
	await reader.cancelSelection(page);

	// Now an earlier highlight on the opening paragraph.
	await reader.selectWords(page, "opening", "paragraph");
	await reader.applyHighlight(page, "yellow");
	await reader.cancelSelection(page);

	await page.getByRole("button", { name: "Annotations" }).click();
	await page.getByRole("radio", { name: "Highlights" }).click();

	// Scope to the open annotations drawer so highlights tabs from other
	// drawers (e.g. lingering glossary view on a multi-test worker) can't
	// shift the index ordering.
	const drawer = page.getByRole("dialog").filter({ hasText: "Highlights" });
	const snippets = await drawer
		.locator("li button p.text-foreground")
		.evaluateAll((nodes) => nodes.map((n) => n.textContent ?? ""));

	expect(snippets.length).toBeGreaterThanOrEqual(2);
	// First entry must be the earlier highlight (opening paragraph), second the later one.
	const firstIdx = snippets[0].indexOf("opening");
	const secondIdx = snippets[1].indexOf("sixth");
	expect(firstIdx).toBeGreaterThanOrEqual(0);
	expect(secondIdx).toBeGreaterThanOrEqual(0);
});
