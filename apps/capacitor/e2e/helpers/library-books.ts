import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEpubBuffer } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";

export type LibraryBook = {
	title: string;
	creator: string;
	series?: { name: string; index: number };
	/** Paragraphs of filler, for a Length facet that tells books apart. */
	paragraphs?: number;
};

function seriesMetadata(series: LibraryBook["series"]): string | undefined {
	if (!series) return undefined;
	return `<meta name="calibre:series" content="${series.name}"/><meta name="calibre:series_index" content="${series.index}"/>`;
}

/**
 * Imports `books` in one batch through the folder picker, the path a user
 * takes for many files, and waits until every card is in the library.
 */
export async function seedLibrary(page: Page, books: readonly LibraryBook[]): Promise<void> {
	await test.step(
		"setup: import library",
		async () => {
			const dir = await mkdtemp(join(tmpdir(), "lesefluss-library-"));
			for (const book of books) {
				const body = "<p>Body text of a short book.</p>".repeat(book.paragraphs ?? 1);
				const buffer = await buildEpubBuffer({
					title: book.title,
					creator: book.creator,
					extraMetadata: seriesMetadata(book.series),
					chapters: [{ id: "c1", href: "c1.xhtml", title: "One", body }],
				});
				await writeFile(join(dir, `${book.title.toLowerCase().replace(/\W+/g, "-")}.epub`), buffer);
			}
			await page.goto("/tabs/library");
			await page.getByRole("button", { name: "Add book" }).click();
			const chooserPromise = page.waitForEvent("filechooser");
			await page.getByRole("button", { name: "Import multiple files" }).click();
			await (await chooserPromise).setFiles(dir);
			await page.getByRole("button", { name: `Import ${books.length} books` }).click({
				timeout: 20_000,
			});
			await expect(page.getByText(`Added ${books.length} books`)).toBeVisible({ timeout: 30_000 });
			await page.getByRole("button", { name: "Done" }).click();
			await expect(page.locator("[data-book-title]")).toHaveCount(books.length);
		},
		{ box: true },
	);
}

export function bookCard(page: Page, title: string) {
	return page.locator(`[data-book-title="${title}"]`);
}

/** Card titles in the order the library shows them. */
export function visibleTitles(page: Page): Promise<string[]> {
	return page
		.locator("[data-book-title]")
		.evaluateAll((els) => els.map((el) => el.getAttribute("data-book-title") ?? ""));
}

/** Desktop only: the View popover offers the table. */
export async function openTable(page: Page): Promise<void> {
	await page.getByRole("button", { name: "View", exact: true }).click();
	await page.getByRole("radio", { name: "Table" }).click();
	await page.keyboard.press("Escape");
	await expect(page.getByTestId("library-table")).toBeVisible();
}

/** Row titles in the table's order, read from each row's select box. */
export function tableTitles(page: Page): Promise<string[]> {
	return page
		.getByTestId("library-table")
		.getByRole("checkbox", { name: /^Select / })
		.evaluateAll((els) =>
			els.map((el) => el.getAttribute("aria-label")?.slice("Select ".length) ?? ""),
		);
}

/** Desktop table only: shows the Tags column, then adds `tags` to `title` in its cell. */
export async function tagInTable(page: Page, title: string, tags: string[]): Promise<void> {
	const cell = page.getByRole("button", { name: `Edit tags of ${title}` });
	if ((await cell.count()) === 0) {
		await page.getByRole("button", { name: "View", exact: true }).click();
		await page.getByRole("dialog").getByRole("checkbox", { name: "Tags" }).click();
		await page.keyboard.press("Escape");
	}
	await cell.click();
	for (const tag of tags) {
		await page.getByRole("textbox", { name: "Find or add a tag" }).fill(tag);
		await page.keyboard.press("Enter");
	}
	await page.keyboard.press("Escape");
	await expect(cell).toContainText(tags[tags.length - 1] ?? "");
}
