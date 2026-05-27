import { expect, test } from "@playwright/test";
import { reader } from "./page-objects/reader";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

/**
 * Glossary entry created via selection toolbar must render an inline avatar
 * on the first word of the entry's range AND survive a library round-trip.
 */
test("add to glossary renders an inline avatar that persists across reload", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await reader.selectWords(page, "opening", "paragraph");
	await page.getByRole("button", { name: "Add to glossary" }).click();

	// GlossaryEntryModal opens with the selected text as the default label.
	// Close it (autosaves on every change; closing commits whatever's there).
	await expect(page.getByRole("heading", { name: "Glossary entry" })).toBeVisible();
	await page.keyboard.press("Escape");

	const avatar = page.locator(".glossary-inline-avatar").first();
	await expect(avatar).toBeVisible({ timeout: 5000 });

	// Library round-trip: glossary row must survive in the DB and re-decorate
	// the same word on reader mount.
	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);
	await expect(page.locator(".glossary-inline-avatar").first()).toBeVisible({ timeout: 5000 });
});
