import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEpubBuffer } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { resetStorage } from "./helpers/seed";

/**
 * The web half of folder import. On this build `Capacitor.isNativePlatform()` is
 * false, so the source opens an `<input webkitdirectory multiple>` rather than
 * the Android SAF picker, and the entry point is labelled accordingly.
 */

async function writeLibrary(
	books: { fileName: string; title?: string; creator?: string; body?: string }[],
): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "lesefluss-folder-"));
	for (const book of books) {
		const buffer = await buildEpubBuffer({
			title: book.title,
			creator: book.creator,
			chapters: [
				{ id: "c1", href: "c1.xhtml", title: "One", body: book.body ?? "<p>Body text.</p>" },
			],
		});
		await writeFile(join(dir, book.fileName), buffer);
	}
	return dir;
}

async function openFolderPicker(page: Page) {
	await page.getByRole("button", { name: "Add book" }).click();
	const chooserPromise = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Import multiple files" }).click();
	return { chooser: await chooserPromise };
}

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
});

test("scans a picked folder and imports the selection", async ({ page }) => {
	const dir = await writeLibrary([
		{ fileName: "tidewater.epub", title: "Tidewater", creator: "Ada Vance" },
		{ fileName: "northlight.epub", title: "Northlight", creator: "Iris Mbeki" },
		{ fileName: "cover.jpg", title: "Not A Book" },
	]);

	await page.goto("/tabs/library");
	const { chooser } = await openFolderPicker(page);
	expect(chooser.isMultiple()).toBe(true);
	await chooser.setFiles(dir);

	// Unsupported extensions are dropped by the scan, so the jpg never appears.
	await expect(page.getByText("2 books found")).toBeVisible({ timeout: 20_000 });
	await expect(page.getByTestId("batch-import-candidate")).toHaveCount(2);
	await expect(page.getByText("Ada Vance")).toBeVisible({ timeout: 20_000 });

	await page.getByRole("button", { name: /^Import 2 books$/ }).click();
	await expect(page.getByText("Added 2 books")).toBeVisible({ timeout: 30_000 });

	await page.getByRole("button", { name: "Done" }).click();
	await expect(page.getByText("Tidewater")).toBeVisible();
	await expect(page.getByText("Northlight")).toBeVisible();
});

test("flags a book already in the library and leaves it deselected", async ({ page }) => {
	const first = await writeLibrary([
		{ fileName: "tidewater.epub", title: "Tidewater", creator: "Ada Vance" },
	]);
	const second = await writeLibrary([
		{ fileName: "tidewater.epub", title: "Tidewater", creator: "Ada Vance" },
		{ fileName: "fathom.epub", title: "Fathom", creator: "Jonas Petri" },
	]);

	await page.goto("/tabs/library");
	const firstPick = await openFolderPicker(page);
	await firstPick.chooser.setFiles(first);
	await page.getByRole("button", { name: /^Import 1 book$/ }).click();
	await expect(page.getByText("Added 1 book")).toBeVisible({ timeout: 30_000 });
	await page.getByRole("button", { name: "Done" }).click();

	const secondPick = await openFolderPicker(page);
	await secondPick.chooser.setFiles(second);
	await expect(page.getByText("2 books found")).toBeVisible({ timeout: 20_000 });

	// Only the book that is not already in the library stays selected.
	await expect(page.getByText("Already in library")).toHaveCount(1, { timeout: 20_000 });
	await expect(page.getByRole("button", { name: /^Import 1 book$/ })).toBeVisible();
});

test("reports an unreadable file without abandoning the rest of the batch", async ({ page }) => {
	const dir = await writeLibrary([
		{ fileName: "riverkeep.epub", title: "Riverkeep", creator: "Nell Okonkwo" },
	]);
	// Valid zip magic, nothing behind it: the parser's own corrupt-EPUB path.
	await writeFile(join(dir, "broken.epub"), Buffer.from("PK not really a zip"));

	await page.goto("/tabs/library");
	const { chooser } = await openFolderPicker(page);
	await chooser.setFiles(dir);

	await expect(page.getByText("2 books found")).toBeVisible({ timeout: 20_000 });
	await page.getByRole("button", { name: /^Import 2 books$/ }).click();

	await expect(page.getByText("Added 1 book")).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText("broken.epub")).toBeVisible();
	await expect(page.getByText("This EPUB file is corrupted or unsupported")).toBeVisible();

	await page.getByRole("button", { name: "Done" }).click();
	await expect(page.getByText("Riverkeep")).toBeVisible();
});
