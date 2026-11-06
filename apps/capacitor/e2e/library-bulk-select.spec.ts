import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildEpubBuffer } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { resetStorage } from "./helpers/seed";

/**
 * Selection mode in the library. Right-click stands in for a long press, the
 * same substitution `chapter-jump-first-word.spec.ts` makes: Playwright cannot
 * hold a synthetic touch for the 400ms the real gesture needs.
 */

const TITLES = ["Tidewater", "Northlight", "Riverkeep"] as const;

/** All three in one batch: the folder import commits them in a single pass. */
async function seedBooks(page: Page) {
	const dir = await mkdtemp(join(tmpdir(), "lesefluss-bulk-"));
	for (const title of TITLES) {
		const buffer = await buildEpubBuffer({
			title,
			creator: "Ada Vance",
			chapters: [{ id: "c1", href: "c1.xhtml", title: "One", body: "<p>Body text.</p>" }],
		});
		await writeFile(join(dir, `${title.toLowerCase()}.epub`), buffer);
	}

	await page.goto("/tabs/library");
	await page.getByRole("button", { name: "Add book" }).click();
	const chooserPromise = page.waitForEvent("filechooser");
	await page.getByRole("button", { name: "Import multiple files" }).click();
	await (await chooserPromise).setFiles(dir);
	await page.getByRole("button", { name: `Import ${TITLES.length} books` }).click({
		timeout: 20_000,
	});
	await expect(page.getByText(`Added ${TITLES.length} books`)).toBeVisible({ timeout: 30_000 });
	await page.getByRole("button", { name: "Done" }).click();
	await expect(page.locator("[data-book-title]")).toHaveCount(TITLES.length);
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

// The single most valuable assertion here: this is the whole `enabled` change
// in useLongPress. A regression sends the reader into the reader instead.
test("long press starts a selection, a tap toggles instead of opening, and exit restores taps", async ({
	page,
}) => {
	await enterSelectionMode(page, "Tidewater");
	await expect(card(page, "Tidewater")).toHaveAttribute("data-selected", "true");
	await expect(page.getByRole("button", { name: "Add book" })).toBeHidden();

	await card(page, "Northlight").click();
	await expect(page).toHaveURL(/\/tabs\/library/);
	await expect(page.getByText("2 selected")).toBeVisible();
	await expect(card(page, "Northlight")).toHaveAttribute("data-selected", "true");

	await card(page, "Northlight").click();
	await expect(page.getByText("1 selected")).toBeVisible();
	await expect(card(page, "Northlight")).not.toHaveAttribute("data-selected", "true");

	await page.getByRole("button", { name: "Exit selection" }).click();
	await expect(page.getByRole("button", { name: "Add book" })).toBeVisible();
	// No leaked handlers: a tap opens the reader again.
	await card(page, "Tidewater").click();
	await expect(page).toHaveURL(/\/tabs\/reader\//);
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
