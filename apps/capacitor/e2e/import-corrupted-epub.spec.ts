import { expect, test } from "@playwright/test";
import { resetStorage } from "./helpers/seed";

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
});

test("corrupted EPUB surfaces a user-visible toast", async ({ page }) => {
	// Empty buffer fails the EPUB_INVALID zip-header check immediately.
	const garbage = Buffer.alloc(0);

	await page.goto("/tabs/library");
	await page.getByRole("button", { name: "Add book" }).click();
	const chooserPromise = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Import file" }).click();
	const chooser = await chooserPromise;
	await chooser.setFiles({
		name: "broken.epub",
		mimeType: "application/epub+zip",
		buffer: garbage,
	});

	await expect(page.getByText("This EPUB file is corrupted or unsupported")).toBeVisible({
		timeout: 10_000,
	});
});
