import {
	buildEpubBuffer,
	strayAnchorFixture,
} from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page } from "@playwright/test";
import { resetAppStorage } from "./app";

/**
 * A fresh local library holding the stray-anchor fixture, imported through the
 * real file picker at /app; the /app twin of e2e/helpers/seed.ts.
 */
export async function importFixtureBook(page: Page): Promise<string> {
	const fixture = strayAnchorFixture();
	const title = fixture.title ?? "Stray Anchor Test";
	await resetAppStorage(page);
	await page.goto("/app/tabs/library");
	await page.getByRole("button", { name: "Add book" }).click();
	const chooser = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Import file" }).click();
	await (await chooser).setFiles({
		name: "stray-anchors.epub",
		mimeType: "application/epub+zip",
		buffer: await buildEpubBuffer(fixture),
	});
	await page.getByRole("button", { name: "Add to library" }).click({ timeout: 20_000 });
	await expect(page.locator(`[data-book-title="${title}"]`)).toHaveCount(1, { timeout: 20_000 });
	return title;
}

export async function openBook(page: Page, title: string) {
	await page.locator(`[data-book-title="${title}"]`).first().click();
	await page.waitForURL(/\/app\/tabs\/reader\//);
}
