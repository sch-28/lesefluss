import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Highlight anchors are stored as Word positions (CONTEXT.md: Highlight anchor;
 * ADR-0002). Switching reader mode must not lose or move them — the underlying
 * `data-word` span must still carry `.word-highlight-yellow` after a mode tour.
 */
test("highlight stays anchored to the same word across mode switches", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await reader.selectWords(page, "opening", "paragraph");
	const wordPosition = await reader.applyHighlight(page, "yellow");

	// Scroll → paged → scroll. Highlight class must follow the same span.
	await reader.setPaginationStyle(page, "page");
	await reader.expectHighlight(page, wordPosition, "yellow");

	await reader.setPaginationStyle(page, "scroll");
	await reader.expectHighlight(page, wordPosition, "yellow");

	// RSVP renders one word at a time; the highlight class isn't visually
	// rendered in RSVP, but on return to standard the same span must still be
	// highlighted (i.e. the DB row + WordPosition anchor survived).
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeHidden();
	await reader.expectHighlight(page, wordPosition, "yellow");
});
