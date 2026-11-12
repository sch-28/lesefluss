import { buildEpubBuffer } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, test } from "@playwright/test";
import { DEEP_CHAPTER_LABEL, NOVEL_TITLE, novelFixture } from "./helpers/novel-book";
import { PLAIN_BOOK_TITLE, plainBookFixture } from "./helpers/plain-book";
import { importEpubViaFilePicker, openBookFromLibrary, resetStorage } from "./helpers/seed";
import { reader } from "./page-objects/reader";

const book = `[data-book-title="${PLAIN_BOOK_TITLE}"]`;
const IN_USE = "Lesefluss is open in another tab";
const MOVED = "Lesefluss is now open in another tab";

test("the library moves between tabs and each tab keeps it intact", async ({ page, context }) => {
	await resetStorage(page);
	await importEpubViaFilePicker(page, {
		buffer: await buildEpubBuffer(plainBookFixture()),
		fileName: "plain.epub",
		title: PLAIN_BOOK_TITLE,
	});

	const second = await context.newPage();
	await second.goto("/tabs/library");
	await expect(second.getByText(IN_USE)).toBeVisible({ timeout: 20_000 });

	await second.getByRole("button", { name: "Use it here" }).click();
	await expect(second.locator(book)).toHaveCount(1, { timeout: 20_000 });
	await expect(page.getByText(MOVED)).toBeVisible();
	await expect(page.locator(book)).toHaveCount(0);

	await page.getByRole("button", { name: "Use it here again" }).click();
	await expect(page.locator(book)).toHaveCount(1, { timeout: 20_000 });
	await expect(second.getByText(MOVED)).toBeVisible();
});

test("the tab that lets go leaves its reading position saved for the tab that takes over", async ({
	page,
	context,
}) => {
	await resetStorage(page);
	const buffer = await buildEpubBuffer(novelFixture());
	await importEpubViaFilePicker(page, { buffer, fileName: "book.epub", title: NOVEL_TITLE });
	await openBookFromLibrary(page, NOVEL_TITLE);
	const committed = await reader.moveToChapter(page, DEEP_CHAPTER_LABEL);
	const id = reader.bookIdFromUrl(page);

	const second = await context.newPage();
	await second.goto("/tabs/library");
	await second.getByRole("button", { name: "Use it here" }).click({ timeout: 20_000 });
	await expect(page.getByText(MOVED)).toBeVisible({ timeout: 20_000 });
	await expect(second.locator(`[data-book-title="${NOVEL_TITLE}"]`)).toHaveCount(1, {
		timeout: 20_000,
	});
	const row = await reader.savedRow(second, id);
	expect(row?.wordPosition).toBe(committed);
});

test("a reload opens the library without a manual step", async ({ page }) => {
	await resetStorage(page);
	await importEpubViaFilePicker(page, {
		buffer: await buildEpubBuffer(plainBookFixture()),
		fileName: "plain.epub",
		title: PLAIN_BOOK_TITLE,
	});

	for (let i = 0; i < 3; i++) {
		await page.reload();
		await expect(page.locator(book)).toHaveCount(1, { timeout: 20_000 });
		await expect(page.getByText(IN_USE)).toHaveCount(0);
	}
});

test("a window that allows no storage explains what to do instead of going blank", async ({
	page,
}) => {
	await resetStorage(page);
	await page.addInitScript(() => {
		Object.defineProperty(StorageManager.prototype, "getDirectory", {
			value: undefined,
			configurable: true,
		});
		IDBFactory.prototype.open = () => {
			throw new DOMException("The user denied permission to access the database.", "SecurityError");
		};
	});
	await page.goto("/tabs/library");
	await expect(page.getByText("This window can't keep your library")).toBeVisible({
		timeout: 20_000,
	});
	await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
