import { buildEpubBuffer } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { resetStorage } from "./helpers/seed";

/**
 * Selection mode in the library. Right-click stands in for a long press, the
 * same substitution `book-detail-chapter-jump.spec.ts` makes: Playwright cannot
 * hold a synthetic touch for the 400ms the real gesture needs.
 */

const TITLES = ["Tidewater", "Northlight", "Riverkeep"] as const;

/**
 * Imports and *commits* one book. `importEpubViaFilePicker` stops at the confirm
 * sheet, which is fine when seeding a single book but leaves a modal over the
 * library that the next import cannot get past.
 */
async function importBook(page: Page, title: string) {
	await page.goto("/tabs/library");
	const buffer = await buildEpubBuffer({
		title,
		creator: "Ada Vance",
		chapters: [{ id: "c1", href: "c1.xhtml", title: "One", body: "<p>Body text.</p>" }],
	});

	await page.getByRole("button", { name: "Add book" }).click();
	const chooserPromise = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Import file" }).click();
	const chooser = await chooserPromise;
	await chooser.setFiles({
		name: `${title.toLowerCase()}.epub`,
		mimeType: "application/epub+zip",
		buffer,
	});

	await page.getByRole("button", { name: "Add to library" }).click({ timeout: 20_000 });
	await expect(page.locator(`[data-book-title="${title}"]`)).toHaveCount(1, { timeout: 20_000 });
}

async function seedBooks(page: Page) {
	for (const title of TITLES) await importBook(page, title);
}

function card(page: Page, title: string) {
	return page.locator(`[data-book-title="${title}"]`);
}

async function enterSelectionMode(page: Page, title: string) {
	await card(page, title).click({ button: "right" });
	await page.getByRole("button", { name: "Select", exact: true }).click();
	await expect(page.getByText("1 selected")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
	await seedBooks(page);
});

test("long press offers Select, which starts a selection with that book", async ({ page }) => {
	await enterSelectionMode(page, "Tidewater");
	await expect(card(page, "Tidewater")).toHaveAttribute("data-selected", "true");
	await expect(card(page, "Northlight")).not.toHaveAttribute("data-selected", "true");
});

// The single most valuable assertion here: this is the whole `enabled` change
// in useLongPress. A regression sends the reader into the reader instead.
test("a tap toggles a card instead of opening it", async ({ page }) => {
	await enterSelectionMode(page, "Tidewater");

	await card(page, "Northlight").click();
	await expect(page).toHaveURL(/\/tabs\/library/);
	await expect(page.getByText("2 selected")).toBeVisible();
	await expect(card(page, "Northlight")).toHaveAttribute("data-selected", "true");

	await card(page, "Northlight").click();
	await expect(page.getByText("1 selected")).toBeVisible();
	await expect(card(page, "Northlight")).not.toHaveAttribute("data-selected", "true");
});

test("select-all takes only what the search leaves visible, and the rest stays picked", async ({
	page,
}) => {
	await enterSelectionMode(page, "Tidewater");

	await page.getByRole("button", { name: "Search library" }).click();
	await page.getByPlaceholder("Search title or author").fill("north");
	await page.getByRole("button", { name: "All", exact: true }).click();

	// Tidewater is hidden by the search but stays selected, which is what lets a
	// selection be built across several searches.
	await expect(page.getByText("2 selected")).toBeVisible();

	await page.getByPlaceholder("Search title or author").fill("");
	await expect(card(page, "Tidewater")).toHaveAttribute("data-selected", "true");
	await expect(card(page, "Northlight")).toHaveAttribute("data-selected", "true");
	await expect(card(page, "Riverkeep")).not.toHaveAttribute("data-selected", "true");
});

test("deleting a selection names the books and removes exactly those", async ({ page }) => {
	await enterSelectionMode(page, "Tidewater");
	await card(page, "Northlight").click();

	await page.getByRole("button", { name: "Bulk actions" }).click();
	await page.getByRole("button", { name: "Delete", exact: true }).click();

	// Named, not just counted: some of a selection can be off screen.
	const dialog = page.getByRole("alertdialog");
	await expect(dialog).toContainText("Delete 2 books?");
	await expect(dialog).toContainText("Tidewater");
	await expect(dialog).toContainText("Northlight");

	await dialog.getByRole("button", { name: "Delete" }).click();

	await expect(card(page, "Tidewater")).toHaveCount(0);
	await expect(card(page, "Northlight")).toHaveCount(0);
	await expect(card(page, "Riverkeep")).toHaveCount(1);
	// The run ends by leaving selection mode.
	await expect(page.getByRole("button", { name: "Exit selection" })).toHaveCount(0);
});

test("setting a status applies it to the whole selection", async ({ page }) => {
	await enterSelectionMode(page, "Tidewater");
	await card(page, "Northlight").click();

	await page.getByRole("button", { name: "Bulk actions" }).click();
	await page.getByRole("button", { name: "Set reading status" }).click();
	await page.getByRole("button", { name: "Finished", exact: true }).click();

	await expect(page.getByRole("button", { name: "Exit selection" })).toHaveCount(0);

	await page.getByRole("button", { name: "Filter" }).click();
	await page.getByRole("button", { name: "Finished", exact: true }).click();

	await expect(card(page, "Tidewater")).toHaveCount(1);
	await expect(card(page, "Northlight")).toHaveCount(1);
	await expect(card(page, "Riverkeep")).toHaveCount(0);
});

test("tagging a selection puts the tag on every picked book", async ({ page }) => {
	await enterSelectionMode(page, "Tidewater");
	await card(page, "Northlight").click();

	await page.getByRole("button", { name: "Bulk actions" }).click();
	await page.getByRole("button", { name: "Edit tags" }).click();

	await page.getByPlaceholder("New tag").fill("summer");
	await page.getByRole("button", { name: "Add tag" }).click();
	await page.getByRole("button", { name: "Apply" }).click();

	await expect(page.getByRole("button", { name: "Exit selection" })).toHaveCount(0);

	// The tag filter is the proof: it reads the committed rows, not the sheet.
	await page.getByRole("button", { name: "Filter" }).click();
	await page.getByRole("button", { name: "summer", exact: true }).click();

	await expect(card(page, "Tidewater")).toHaveCount(1);
	await expect(card(page, "Northlight")).toHaveCount(1);
	await expect(card(page, "Riverkeep")).toHaveCount(0);
});

test("removing a tag clears it from the books that had it", async ({ page }) => {
	// Tag two books, then take it off one of them.
	await enterSelectionMode(page, "Tidewater");
	await card(page, "Northlight").click();
	await page.getByRole("button", { name: "Bulk actions" }).click();
	await page.getByRole("button", { name: "Edit tags" }).click();
	await page.getByPlaceholder("New tag").fill("summer");
	await page.getByRole("button", { name: "Add tag" }).click();
	await page.getByRole("button", { name: "Apply" }).click();
	await expect(page.getByRole("button", { name: "Exit selection" })).toHaveCount(0);

	await enterSelectionMode(page, "Tidewater");
	await page.getByRole("button", { name: "Bulk actions" }).click();
	await page.getByRole("button", { name: "Edit tags" }).click();
	// Every picked book carries it, so the first tap offers to take it off.
	await page.getByRole("button", { name: /summer/ }).click();
	await page.getByRole("button", { name: "Apply" }).click();

	await page.getByRole("button", { name: "Filter" }).click();
	await page.getByRole("button", { name: "summer", exact: true }).click();

	await expect(card(page, "Northlight")).toHaveCount(1);
	await expect(card(page, "Tidewater")).toHaveCount(0);
});

// The whole reason the tri-state exists: with a tag on only some of the picked
// books, the first tap must offer to put it on the rest, not take it off.
test("a tag on only some of the selection offers to add it to the rest", async ({ page }) => {
	await enterSelectionMode(page, "Tidewater");
	await page.getByRole("button", { name: "Bulk actions" }).click();
	await page.getByRole("button", { name: "Edit tags" }).click();
	await page.getByPlaceholder("New tag").fill("summer");
	await page.getByRole("button", { name: "Add tag" }).click();
	await page.getByRole("button", { name: "Apply" }).click();
	await expect(page.getByRole("button", { name: "Exit selection" })).toHaveCount(0);

	await enterSelectionMode(page, "Tidewater");
	await card(page, "Northlight").click();
	await page.getByRole("button", { name: "Bulk actions" }).click();
	await page.getByRole("button", { name: "Edit tags" }).click();

	await expect(page.getByRole("button", { name: /summer/ })).toContainText("On 1 of 2");
	await page.getByRole("button", { name: /summer/ }).click();
	await expect(page.getByRole("button", { name: /summer/ })).toContainText("Add to all");

	await page.getByRole("button", { name: "Apply" }).click();
	await page.getByRole("button", { name: "Filter" }).click();
	await page.getByRole("button", { name: "summer", exact: true }).click();
	await expect(card(page, "Tidewater")).toHaveCount(1);
	await expect(card(page, "Northlight")).toHaveCount(1);
});

// The sheet does not unmount, so a close that bypasses its own handlers must
// still clear what was staged, or the next selection inherits it.
test("closing the tag sheet discards what was staged in it", async ({ page }) => {
	await enterSelectionMode(page, "Tidewater");
	await page.getByRole("button", { name: "Bulk actions" }).click();
	await page.getByRole("button", { name: "Edit tags" }).click();
	await page.getByPlaceholder("New tag").fill("summer");
	await page.getByRole("button", { name: "Add tag" }).click();
	await expect(page.getByRole("button", { name: "Apply" })).toBeEnabled();

	await page.getByRole("button", { name: "Cancel" }).click();
	await page.getByRole("button", { name: "Bulk actions" }).click();
	await page.getByRole("button", { name: "Edit tags" }).click();

	await expect(page.getByRole("button", { name: "Apply" })).toBeDisabled();
	await expect(page.getByRole("button", { name: /summer/ })).toHaveCount(0);
});

test("leaving selection mode restores the library, taps included", async ({ page }) => {
	await enterSelectionMode(page, "Tidewater");
	await expect(page.getByRole("button", { name: "Add book" })).toBeHidden();

	await page.getByRole("button", { name: "Exit selection" }).click();
	await expect(page.getByRole("button", { name: "Exit selection" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Add book" })).toBeVisible();

	// No leaked handlers: a tap opens the reader again.
	await card(page, "Tidewater").click();
	await expect(page).toHaveURL(/\/tabs\/reader\//);
});
