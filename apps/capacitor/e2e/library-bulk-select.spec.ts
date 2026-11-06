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
			creator: title === "Riverkeep" ? "Bo Lind" : "Ada Vance",
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

	await page.getByRole("button", { name: "Done", exact: true }).click();
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
	await expect(page.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
});

test("tagging a selection puts the tag on every picked book", async ({ page }) => {
	await enterSelectionMode(page, "Tidewater");
	await card(page, "Northlight").click();

	await page.getByRole("button", { name: "Bulk actions" }).click();
	await page.getByRole("button", { name: "Edit tags" }).click();

	await page.getByPlaceholder("New tag").fill("summer");
	await page.getByRole("button", { name: "Add tag" }).click();
	await page.getByRole("button", { name: "Apply" }).click();

	await expect(page.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);

	// The tag filter is the proof: it reads the committed rows, not the sheet.
	await page.getByRole("button", { name: "Add filter" }).click();
	await page.getByTestId("filter-picker").getByRole("button", { name: /^Tag/ }).first().click();
	await page.getByRole("button", { name: "Tag summer, off" }).click();

	await expect(card(page, "Tidewater")).toHaveCount(1);
	await expect(card(page, "Northlight")).toHaveCount(1);
	await expect(card(page, "Riverkeep")).toHaveCount(0);
});

test("Shift-click selects the run, Ctrl-click toggles one, Select all N takes the whole view", async ({
	page,
}) => {
	// Library order is newest first, so read it rather than assume it.
	const order = await page
		.locator("[data-book-title]")
		.evaluateAll((els) => els.map((el) => el.getAttribute("data-book-title") ?? ""));
	const [first, middle, last] = order as [string, string, string];

	await card(page, first).click({ modifiers: ["ControlOrMeta"] });
	await expect(page.getByText("1 selected")).toBeVisible();
	await card(page, last).click({ modifiers: ["Shift"] });
	await expect(page.getByText("3 selected")).toBeVisible();
	await expect(card(page, middle)).toHaveAttribute("data-selected", "true");

	await card(page, middle).click({ modifiers: ["ControlOrMeta"] });
	await expect(page.getByText("2 selected")).toBeVisible();
	await expect(page).toHaveURL(/\/tabs\/library/);

	await page.getByRole("button", { name: `Select all ${TITLES.length}` }).click();
	await expect(page.getByText(`${TITLES.length} selected`)).toBeVisible();

	const grid = page.getByTestId("library-items");
	const box = await grid.boundingBox();
	if (!box) throw new Error("no grid");
	const gap = { x: box.x + box.width - 8, y: box.y + box.height - 8 };
	expect(
		await page.evaluate(
			({ x, y }) => document.elementFromPoint(x, y)?.closest("button, a, [data-book-id]") != null,
			gap,
		),
	).toBe(false);
	await page.mouse.click(gap.x, gap.y);
	await expect(page.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
});

test("Select all takes only the books the filter shows", async ({ page }) => {
	await page.getByTestId("filter-bar").getByRole("button", { name: "Add filter" }).click();
	const picker = page.getByTestId("filter-picker");
	await picker.getByRole("button", { name: "Author", exact: false }).first().click();
	await picker.getByRole("button", { name: "Author Ada Vance, off" }).click();
	await page.keyboard.press("Escape");
	await expect(page.locator("[data-book-title]")).toHaveCount(2);

	await enterSelectionMode(page, "Tidewater");
	await page.getByRole("button", { name: "Select all 2" }).click();
	await expect(page.getByText("2 selected")).toBeVisible();
	await expect(card(page, "Northlight")).toHaveAttribute("data-selected", "true");
});

test("the … button and right-click open the per-book menu", async ({ page }) => {
	await card(page, "Tidewater").hover();
	await page.getByRole("button", { name: "More for Tidewater" }).click();
	await expect(page.getByRole("button", { name: "Select", exact: true })).toBeVisible();
});
