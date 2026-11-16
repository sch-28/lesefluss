import { expect, type Page, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

const avatars = (page: Page) => page.locator(".glossary-inline-avatar");

async function addGlossaryEntry(page: Page, startText: string, endText: string) {
	// A drag while the previous drawer still animates out never reaches the reader.
	await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 5000 });
	await reader.selectWords(page, startText, endText);
	await page.getByRole("button", { name: "Glossary", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Glossary entry" })).toBeVisible();
}

async function reopen(page: Page, title: string) {
	await page.goto("/tabs/library");
	await openBookFromLibrary(page, title);
}

test("a glossary entry's avatar, rename and delete persist across reloads", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	// Deleted in the editor the create flow opened: reopening via an avatar tap is
	// coupled to vaul's animation timing under Playwright.
	await addGlossaryEntry(page, "develops", "moment");
	await reader.deleteGlossaryFromEditor(page);
	await expect(avatars(page)).toHaveCount(0, { timeout: 10_000 });
	await reader.dismissSelection(page);

	// The editor autosaves; closing it commits the selected text as the label.
	await addGlossaryEntry(page, "opening", "paragraph");
	await page.keyboard.press("Escape");
	await expect(avatars(page).first()).toBeVisible({ timeout: 5000 });
	await reader.dismissSelection(page);

	// A label with no match in the book renders no avatar: the sheet lists the stored row.
	const newLabel = "spec-renamed-entry";
	await addGlossaryEntry(page, "develops", "moment");
	await reader.setGlossaryLabelFromEditor(page, newLabel);
	await page.keyboard.press("Escape");

	await reopen(page, title);
	await expect(avatars(page).first()).toBeVisible({ timeout: 5000 });
	await reader.openContents(page);
	await page.getByRole("radio", { name: "Glossary" }).click();
	await expect(page.getByText(newLabel)).toBeVisible({ timeout: 5000 });
});
