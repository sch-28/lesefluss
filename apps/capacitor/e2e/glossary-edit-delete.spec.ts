import { expect, test } from "@playwright/test";
import { reader } from "./page-objects/reader";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

test("glossary label edit persists across reload", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await reader.selectWords(page, "opening", "paragraph");
	await page.getByRole("button", { name: "Add to glossary" }).click();
	await expect(page.getByRole("heading", { name: "Glossary entry" })).toBeVisible();

	const newLabel = "spec-renamed-entry";
	await reader.setGlossaryLabelFromEditor(page, newLabel);
	await page.keyboard.press("Escape");

	// Reload + reopen via the annotations sheet's Glossary tab. The label-only
	// rename has no on-page substring match (no "spec-renamed-entry" in the
	// book), so the avatar disappears; the sheet lists the actual DB row.
	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);
	await page.getByRole("button", { name: "Annotations" }).click();
	await page.getByRole("radio", { name: "Glossary" }).click();
	await expect(page.getByText(newLabel)).toBeVisible({ timeout: 5000 });
});

test("glossary delete from initial editor removes the avatar", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	await reader.selectWords(page, "opening", "paragraph");
	await page.getByRole("button", { name: "Add to glossary" }).click();
	await expect(page.getByRole("heading", { name: "Glossary entry" })).toBeVisible();

	// Delete inside the same modal instance the create flow opened, before
	// the drawer closes. Reopen-via-avatar-tap was too coupled to vaul's
	// animation timing under Playwright.
	await reader.deleteGlossaryFromEditor(page);

	await expect(page.locator(".glossary-inline-avatar")).toHaveCount(0, { timeout: 10_000 });
});
