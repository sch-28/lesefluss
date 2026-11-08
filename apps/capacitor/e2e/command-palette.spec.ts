import { expect, type Page, test } from "@playwright/test";
import { CHAPTER_NOVEL_TITLE, chapterHeading, seedChapterNovel } from "./helpers/chapter-novel";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * The Ctrl+K palette: opens over library and reader, lists every reader action
 * under the shared scope names with its shortcut, and runs what it finds.
 * Ctrl+O opens the app's import sheet, never the browser's Open file dialog.
 */

const palette = (page: Page) => page.getByTestId("command-palette");
const importSheet = (page: Page) => page.getByRole("button", { name: /Import file/ });

async function pressPrevented(page: Page, key: string): Promise<boolean> {
	const finalKey = key.split("+").pop() ?? key;
	await page.evaluate((finalKey) => {
		const probe = (e: KeyboardEvent) => {
			// Control+o also sends a keydown for Control alone first.
			if (e.key.toLowerCase() !== finalKey.toLowerCase()) return;
			(window as unknown as { __prevented?: boolean }).__prevented = e.defaultPrevented;
			window.removeEventListener("keydown", probe);
		};
		window.addEventListener("keydown", probe);
	}, finalKey);
	await page.keyboard.press(key);
	return page.evaluate(() => (window as unknown as { __prevented?: boolean }).__prevented === true);
}

test("in the library, Ctrl+K filters and runs import, and Ctrl+O opens the import sheet", async ({
	page,
}) => {
	await seedChapterNovel(page);
	await page.keyboard.press("Control+k");
	await expect(palette(page)).toBeVisible();
	await expect(palette(page).getByRole("group", { name: "Everywhere" })).toBeVisible();
	await palette(page).getByRole("combobox").fill("imp");
	await expect(palette(page).getByRole("option").first()).toContainText("Import");
	await palette(page).getByRole("combobox").fill("import a book");
	await page.keyboard.press("Enter");
	await expect(palette(page)).toBeHidden();
	await expect(importSheet(page)).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(importSheet(page)).toBeHidden();

	expect(await pressPrevented(page, "Control+o")).toBe(true);
	await expect(importSheet(page)).toBeVisible();
});

test("in the reader, the palette lists every reader action, shows its shortcut and jumps to a chapter", async ({
	page,
}) => {
	// Listen is offered only where read-aloud works; the fake engine stands in for Android's.
	await page.addInitScript(() => {
		window.__lesefluss_e2e_fakeTts = true;
	});
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.waitOpenSettled(page);
	// With a bookmark, so Next bookmark is offered too.
	await reader.blurFocusedControl(page);
	await page.keyboard.press("b");
	await expect(page.getByRole("button", { name: "Bookmark", pressed: true })).toBeVisible();

	await page.keyboard.press("Control+k");
	await expect(palette(page)).toBeVisible();
	const groups = palette(page).getByRole("group");
	await expect(groups.first()).toHaveAttribute("aria-label", "Reader");
	await expect(palette(page).getByRole("group", { name: "Everywhere" })).toBeVisible();

	const readerActions = [
		"Read with RSVP",
		"Search in book",
		"Appearance",
		"Contents and highlights",
		/^Switch to (page|scroll) view/,
		"Book details",
		"Listen",
		"Remove bookmark here",
		"Next bookmark",
		"Fullscreen",
		"Quick RSVP",
	];
	for (const name of readerActions) {
		const row =
			typeof name === "string"
				? palette(page).getByRole("option", { name: new RegExp(`^${name}`) })
				: palette(page).getByRole("option", { name });
		await expect(row, String(name)).toHaveCount(1);
	}
	const rsvp = palette(page).getByRole("option", { name: /Read with RSVP/ });
	await expect(rsvp.locator("kbd")).toHaveText("R");

	await palette(page).getByRole("combobox").fill("chapter 4");
	await page.keyboard.press("Enter");
	await expect(palette(page)).toBeHidden();
	await expect(page.locator(".reader-heading", { hasText: chapterHeading(4) })).toBeInViewport();

	expect(await pressPrevented(page, "Control+o")).toBe(true);
	await page.waitForURL(/\/tabs\/library/);
	await expect(importSheet(page)).toBeVisible();
});
