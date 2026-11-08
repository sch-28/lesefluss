import { expect, type Page, test } from "@playwright/test";
import { openTable, seedLibrary, tableTitles, tagInTable } from "./helpers/library-books";
import { resetStorage } from "./helpers/seed";

/** Riverkeep alone is past 50k words (six words a paragraph). */
const BOOKS = [
	{ title: "Tidewater", creator: "Ada Vance" },
	{ title: "Northlight", creator: "Ada Vance" },
	{ title: "Riverkeep", creator: "Bo Lind", paragraphs: 9000 },
] as const;

test.use({ viewport: { width: 1400, height: 900 } });

const picker = (page: Page) => page.getByTestId("filter-picker");
const bar = (page: Page) => page.getByTestId("filter-bar");

async function openFacet(page: Page, facet: string) {
	await bar(page).getByRole("button", { name: "Add filter" }).click();
	await picker(page)
		.getByRole("button", { name: new RegExp(`^${facet} `) })
		.first()
		.click();
}

async function search(page: Page, text: string) {
	const box = page.getByRole("combobox", { name: "Search library" });
	if (!(await box.isVisible())) await page.getByRole("button", { name: "Search library" }).click();
	await box.fill(text);
	await box.press("Enter");
}

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
	await seedLibrary(page, BOOKS);
	await openTable(page);
});

test("the filter lives in the URL, so a link reopens the same view", async ({ page }) => {
	await openFacet(page, "Author");
	await picker(page).getByRole("button", { name: "Author Bo Lind, off" }).click();
	await page.keyboard.press("Escape");
	await expect.poll(() => tableTitles(page)).toEqual(["Riverkeep"]);
	await expect(page).toHaveURL(/[?&]f=/);
	const link = page.url();

	await bar(page).getByRole("button", { name: "Clear", exact: true }).click();
	await expect.poll(() => tableTitles(page)).toHaveLength(BOOKS.length);
	await expect(page).not.toHaveURL(/[?&]f=/);

	await page.goto(link);
	await expect(
		bar(page).getByRole("button", { name: "Remove filter Author: Bo Lind" }),
	).toBeVisible();
	await expect.poll(() => tableTitles(page)).toEqual(["Riverkeep"]);
});

test("tags match any by default and all after the toggle", async ({ page }) => {
	await tagInTable(page, "Tidewater", ["sea", "salt"]);
	await tagInTable(page, "Riverkeep", ["sea"]);
	await tagInTable(page, "Northlight", ["salt"]);

	await openFacet(page, "Tag");
	await picker(page).getByRole("button", { name: "Tag sea, off" }).click();
	await picker(page).getByRole("button", { name: "Tag salt, off" }).click();
	await expect.poll(() => tableTitles(page)).toHaveLength(3);

	await picker(page).getByRole("button", { name: "all", exact: true }).click();
	await expect.poll(() => tableTitles(page)).toEqual(["Tidewater"]);
	await expect(picker(page).getByRole("button", { name: "all", exact: true })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
});

test("Length and Collection are facets", async ({ page }) => {
	await openFacet(page, "Length");
	await picker(page).getByRole("button", { name: "50k–100k" }).click();
	await page.keyboard.press("Escape");
	await expect.poll(() => tableTitles(page)).toEqual(["Riverkeep"]);
	await bar(page).getByRole("button", { name: "Clear", exact: true }).click();

	await page
		.getByRole("region", { name: "Collections" })
		.getByRole("button", { name: "New collection" })
		.first()
		.click();
	await page.getByRole("textbox", { name: "Name" }).fill("Shore");
	await page.getByRole("button", { name: "EPUB Northlight Ada Vance" }).click();
	await page.getByRole("button", { name: "Create with 1 book" }).click();
	await expect(page).toHaveURL(/collection=/);
	await page.getByRole("link", { name: "Library", exact: true }).click();

	await openFacet(page, "Collection");
	await picker(page).getByRole("button", { name: "Collection Shore, off" }).click();
	await picker(page).getByRole("button", { name: "Collection Shore, included" }).click();
	await page.keyboard.press("Escape");
	await expect
		.poll(() => tableTitles(page))
		.toEqual(expect.arrayContaining(["Tidewater", "Riverkeep"]));
	await expect.poll(() => tableTitles(page)).toHaveLength(2);
});

test.describe("search syntax", () => {
	test("field tokens turn into chips and plain words still search", async ({ page }) => {
		await search(page, 'author:"Ada Vance"');
		await expect(
			bar(page).getByRole("button", { name: /^Remove filter Author: Ada Vance/ }),
		).toBeVisible();
		await expect.poll(() => tableTitles(page)).toHaveLength(2);
		await expect(page.getByRole("combobox", { name: "Search library" })).toHaveValue("");

		await search(page, '-author:"Ada Vance"');
		await expect(
			bar(page).getByRole("button", { name: "Remove filter − Author: Ada Vance" }),
		).toBeVisible();
		await expect.poll(() => tableTitles(page)).toEqual(["Riverkeep"]);

		await bar(page).getByRole("button", { name: "Clear", exact: true }).click();
		await search(page, "north");
		await expect.poll(() => tableTitles(page)).toEqual(["Northlight"]);
	});

	test("words:<50k leaves out the long book", async ({ page }) => {
		await search(page, "words:<50k");
		await expect.poll(() => tableTitles(page)).toHaveLength(2);
		expect(await tableTitles(page)).not.toContain("Riverkeep");
	});

	test("a field prefix offers its completions", async ({ page }) => {
		await page.getByRole("button", { name: "Search library" }).click();
		await page.getByRole("combobox", { name: "Search library" }).fill("author:B");
		const suggestions = page.getByTestId("search-suggestions");
		await expect(suggestions).toContainText("Bo Lind");
	});
});
