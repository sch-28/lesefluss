import { expect, type Page } from "@playwright/test";
import {
	buildEpubBuffer,
	strayAnchorFixture,
} from "@lesefluss/book-import/test-fixtures/build-epub";
import { resetStorage } from "./storage";

export { resetStorage };

/**
 * Drive the library import sheet to ingest an EPUB through the real file
 * picker. Goes through the same parser + WordIndex build + SQLite write path
 * the app uses on device.
 */
export async function importEpubViaFilePicker(
	page: Page,
	opts: { buffer: Buffer; fileName: string; title: string },
) {
	await page.goto("/tabs/library");
	await page.getByRole("button", { name: "Add book" }).click();
	const chooserPromise = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Import file" }).click();
	const chooser = await chooserPromise;
	await chooser.setFiles({
		name: opts.fileName,
		mimeType: "application/epub+zip",
		buffer: opts.buffer,
	});
	await expect(page.getByText(opts.title)).toBeVisible({ timeout: 15_000 });
}

/**
 * One-shot setup for reader-focused tests: wipe storage, import the
 * stray-anchor Book fixture, return its title for locator scoping.
 */
export async function seedStrayAnchorBook(page: Page): Promise<string> {
	const fixture = strayAnchorFixture();
	const title = fixture.title ?? "Stray Anchor Test";
	await resetStorage(page);
	const buffer = await buildEpubBuffer(fixture);
	await importEpubViaFilePicker(page, { buffer, fileName: "stray-anchors.epub", title });
	return title;
}

/**
 * Click a library card by Book title and wait for the reader route to mount.
 * Centralises the selector + URL-wait so spec code stops re-inventing it.
 */
export async function openBookFromLibrary(page: Page, title: string) {
	await page.getByText(title).first().click();
	await page.waitForURL(/\/tabs\/reader\//);
}
