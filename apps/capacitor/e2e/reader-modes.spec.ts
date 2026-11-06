import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

// A phone-width reader: these cover single-page mechanics, and the spread starts at 900px.
test.use({ viewport: { width: 420, height: 800 } });

test("setting defaultReaderMode = rsvp opens new books in RSVP", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);

	await page.goto("/tabs/settings/general");
	const rsvpCard = page.getByRole("button", { name: /^RSVP Flash one word at a time$/ });
	await rsvpCard.click();
	await expect(rsvpCard).toHaveAttribute("aria-pressed", "true");

	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
	// toBeHidden on `.first()` passes vacuously when nothing matches; a count does not.
	await expect(page.locator("span[data-word]")).toHaveCount(0);
});

/**
 * ADR-0002: Word position is canonical. After a tour through every reader view,
 * a highlight is still on its word and reopening lands on the word reached
 * before the tour. A mode that reseeds from another unit on the way out drifts
 * `books.wordPosition`.
 */
test("highlight and word position survive a scroll → paged → rsvp tour", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await reader.selectWords(page, "opening", "paragraph");
	const highlighted = await reader.applyHighlight(page, "yellow");
	await reader.dismissSelection(page);
	await reader.setPaginationStyle(page, "page");
	await reader.expectHighlight(page, highlighted, "yellow");
	await reader.setPaginationStyle(page, "scroll");
	await reader.expectHighlight(page, highlighted, "yellow");
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeHidden();
	await reader.expectHighlight(page, highlighted, "yellow");

	const savePending = reader.waitForNextSave(page);
	await reader.moveToChapter(page, "2: Second");
	await expect(page.locator("h2", { hasText: "TITLE 2" })).toBeInViewport({ timeout: 5000 });
	await savePending;
	const chapter2Word = await reader.lastSavedWord(page);
	const id = reader.bookIdFromUrl(page);

	// RsvpView mounts at `initialWord` from lastWordRef, and hands the same word back.
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeHidden();
	expect((await reader.savedRow(page, id))?.wordPosition).toBe(chapter2Word);

	await reader.setPaginationStyle(page, "page");
	await reader.setPaginationStyle(page, "scroll");

	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);
	const ch2 = page.locator("body").getByText("Chapter 2 opening paragraph anchors the scene.");
	await expect(ch2).toBeVisible({ timeout: 10_000 });
	await expect(ch2).toBeInViewport();
});
