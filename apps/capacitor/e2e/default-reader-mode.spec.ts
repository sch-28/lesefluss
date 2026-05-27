import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

/**
 * settings.defaultReaderMode = "rsvp" must seed the reader into RSVP view on
 * mount (`didSeedModeRef` flow in reader/index.tsx). New imports respect the
 * default; closed-and-reopened books resume whichever mode they were last in.
 */
test("setting defaultReaderMode = rsvp opens new books in RSVP", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);

	await page.goto("/tabs/settings/rsvp");
	// Reading Mode toggle: two cards labelled "Reader" (scroll) and "RSVP".
	// Scope to button role to avoid matching the section header text.
	const rsvpCard = page.getByRole("button", { name: /^RSVP Flash one word at a time$/ });
	await rsvpCard.click();
	await expect(rsvpCard).toHaveAttribute("aria-pressed", "true");

	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);

	// RSVP view mounts only when readerMode === "rsvp"; the .rsvp-display
	// container is unique to that view.
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
	// Scroll view spans must not exist at all (toBeHidden on `.first()` passes
	// vacuously when zero elements match; count assertion is stricter).
	await expect(page.locator("span[data-word]")).toHaveCount(0);
});
