import { expect, test } from "@playwright/test";
import { reader } from "./page-objects/reader";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

test("search result click jumps the reader to the matching word", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	// Open search modal via header button.
	await page.getByRole("button", { name: "Search content" }).click();
	const input = page.getByPlaceholder("Search in book…");
	await expect(input).toBeVisible();

	// Phrase unique to chapter 2 in the fixture.
	const phrase = "Chapter 2 sixth";
	await input.fill(phrase);

	// Click first result. The search modal renders results as <ul><li><button>
	// snippets containing the matched phrase; the button bubbles to handleResultTap.
	const firstResult = page.locator("ul li button", { hasText: phrase }).first();
	const savePending = reader.waitForNextSave(page);
	await firstResult.click();
	await savePending;

	// Reader navigated to the hit; the matching paragraph should be in viewport.
	// Scope to the reader paragraph (the search result button also contains the
	// matched text snippet, triggering strict-mode collisions otherwise).
	await expect(
		page.locator("p.reader-paragraph", {
			hasText: "Chapter 2 sixth paragraph closes the chapter completely.",
		}),
	).toBeInViewport({ timeout: 5000 });
});
