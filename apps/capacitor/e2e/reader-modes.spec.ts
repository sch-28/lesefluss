import { expect, test } from "@playwright/test";
import { reader } from "./page-objects/reader";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

/**
 * ADR-0002: Word position is canonical. After a tour through every reader view
 * (scroll → RSVP → scroll → paged → scroll), closing and reopening the book
 * must land the user at the same word they reached before the tour. If any
 * mode reseeds from a different unit on the way out, the durable position
 * stored in `books.wordPosition` drifts and this test fails.
 */
test("word position survives a scroll → rsvp → paged → scroll tour", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	// Move to chapter 2 so the position is non-zero and observable across reloads.
	const savePending = reader.waitForNextSave(page);
	await reader.tocJumpToChapter(page, "2: Second");
	await expect(page.locator("h2", { hasText: "TITLE 2" })).toBeInViewport({ timeout: 5000 });
	await savePending;

	// Scroll → RSVP. RsvpView mounts at `initialWord` from lastWordRef.
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });

	// RSVP → standard. exitRsvpToStandard() calls savePosition again.
	const exitSave = reader.waitForNextSave(page);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeHidden();
	await exitSave;

	// Standard → paged.
	await reader.setPaginationStyle(page, "page");

	// Paged → scroll.
	await reader.setPaginationStyle(page, "scroll");

	// Close + reopen. Position must still be at chapter 2.
	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);

	const ch2 = page.locator("body").getByText("Chapter 2 opening paragraph anchors the scene.");
	await expect(ch2).toBeVisible({ timeout: 10_000 });
	await expect(ch2).toBeInViewport();
});
