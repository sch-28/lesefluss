import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

test("readerActiveWordUnderline toggle adds/removes .word-active on the active span", async ({
	page,
}) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	// Tap a word to make it the active word. handleWordTap → setActiveWord +
	// savePosition. Pick "opening" in ch1 — definitely visible.
	const word = page.locator("span[data-word]", { hasText: "opening" }).first();
	await word.dispatchEvent("click");
	await expect(word).toHaveClass(/word-active/);

	// Open the appearance popover and toggle the underline off. Scope the
	// row by its label so we don't match the Glossary highlights row's "Off".
	await page.getByRole("button", { name: "Appearance settings" }).click();
	const underlineRow = page.locator(".ap-row").filter({ hasText: "Underline word" });
	await underlineRow.getByRole("radio", { name: "Off" }).click();
	await page.keyboard.press("Escape");

	await expect(word).not.toHaveClass(/word-active/);

	// Toggle back On.
	await page.getByRole("button", { name: "Appearance settings" }).click();
	await underlineRow.getByRole("radio", { name: "On" }).click();
	await page.keyboard.press("Escape");

	await expect(word).toHaveClass(/word-active/);
});
