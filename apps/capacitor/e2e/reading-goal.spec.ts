import type { EpubFixture } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, bigBookFixture } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

const TITLE = "Goal Book";

/** About 1,300 words: a one-month goal asks for roughly a paragraph and a half a day. */
function goalFixture(): EpubFixture {
	const paragraphs = Array.from(
		{ length: 50 },
		(_, i) =>
			`<p>Goal paragraph ${i + 1} holds a steady run of filler words so that one day's share of the book ends somewhere in the middle of the opening pages.</p>`,
	);
	return {
		title: TITLE,
		chapters: [{ id: "c1", href: "c1.htm", body: `<h1>ONE</h1>${paragraphs.join("")}` }],
		navPoints: [{ label: "1: One", href: "c1.htm" }],
	};
}

async function openBookPage(page: Page): Promise<void> {
	await page.getByRole("button", { name: "More actions" }).click();
	await page.getByRole("menuitem", { name: "Book details", exact: true }).click();
	await page.waitForURL(/\/tabs\/library\/book\//);
}

test("a goal set on the book page shows in the reader and is met by reading", async ({ page }) => {
	await page.clock.install();
	await seedFixture(page, goalFixture(), "goal.epub");
	await openBookFromLibrary(page, TITLE);
	await reader.expectLoaded(page);
	await expect(page.getByTestId("goal-chip")).toHaveCount(0);

	await openBookPage(page);
	await page.getByTestId("goal-entry").getByRole("button", { name: "Set goal" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByRole("button", { name: "1 month" }).click();
	await expect(sheet.getByText("raise daily target")).toBeVisible();
	// Local notifications need the native shell; the web build has no reminder row.
	await expect(sheet.getByText("Reminder")).toHaveCount(0);
	await sheet.getByRole("button", { name: "Start goal" }).click();
	await expect(sheet).toHaveCount(0);

	const card = page.getByTestId("goal-card");
	await expect(card).toBeVisible();
	await expect(card).toContainText("today");
	await expect(card).toContainText("vs plan");
	await expect(card).toContainText("Missed day: raise daily target");

	await page.getByRole("button", { name: /^(Start reading|Continue|Open reader)/ }).click();
	await reader.expectLoaded(page);
	const chip = page.getByTestId("goal-chip");
	await expect(chip).toBeVisible();
	await expect(chip).toHaveAttribute("data-met", "false");
	await expect(page.getByTestId("goal-divider")).toHaveAttribute("data-passed", "false");

	await reader.waitOpenSettled(page);
	// At reading pace: the session tracker only credits what it sees travelled slowly
	// enough between its polls, and only credited reading meets the target for good.
	for (let i = 0; i < 2; i++) {
		const saved = reader.waitForNextSave(page);
		await reader.wheel(page, 200);
		await saved;
		await reader.waitForTrackerTick(page);
	}

	await expect(chip).toHaveAttribute("data-met", "true", { timeout: 10_000 });
	const back = reader.waitForNextSave(page);
	await reader.wheel(page, -3_000);
	await back;
	// Back at the start of the book, short of today's target of a paragraph and a half.
	expect(await reader.lastSavedWord(page)).toBeLessThan(10);
	// Met stays met for the day once reached, wherever the position goes after.
	await expect(chip).toHaveAttribute("data-met", "true");
	await expect(page.getByTestId("goal-divider")).toHaveAttribute("data-passed", "true");
	await chip.click();
	await expect(page.getByText("to go")).toBeVisible();
	await expect(page.getByText("0 min")).toBeVisible();
	await page.keyboard.press("Escape");
	// A sitting under MIN_DURATION_MS is not kept; steps stay under the poll throttle guard.
	for (let i = 0; i < 7; i++) await page.clock.fastForward(10_000);

	// Leaving the reader ends the sitting; the saved row, not the reader's memory, keeps today met.
	await openBookPage(page);
	await expect(page.getByTestId("goal-card")).toHaveAttribute("data-met", "true");
	await page.reload();
	await expect(page.getByTestId("goal-card")).toHaveAttribute("data-met", "true");
});

/** Chunk width with and without the divider, and where the target paragraph ends. */
async function dividerLayout(page: Page) {
	return page.evaluate(() => {
		const divider = document.querySelector<HTMLElement>("[data-testid=goal-divider]");
		const chunk = divider?.closest<HTMLElement>("[data-chunk-index]");
		const last = divider?.parentElement ? [...divider.parentElement.getClientRects()].at(-1) : null;
		if (!divider || !chunk || !last) throw new Error("no divider in a page-mode chunk");
		const shown = divider.style.display !== "none";
		const width = chunk.scrollWidth;
		divider.style.display = "";
		const dividerHeight = divider.offsetHeight;
		divider.style.display = "none";
		const widthWithout = chunk.scrollWidth;
		divider.style.display = shown ? "" : "none";
		return {
			shown,
			width,
			widthWithout,
			gapBelow: chunk.getBoundingClientRect().bottom - last.bottom,
			dividerHeight,
		};
	});
}

test("in page mode the divider never adds a page, even when its paragraph ends a page", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await seedFixture(page, bigBookFixture(), "big.epub");
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await openBookPage(page);

	// Due today: the target is the end of the book, the last paragraph of the last chunk.
	await page.getByRole("button", { name: "Set goal" }).click();
	const sheet = page.getByRole("dialog");
	await sheet.getByRole("button", { name: "Custom date" }).click();
	await sheet
		.locator('input[type="date"]')
		.fill(await page.evaluate(() => new Date().toLocaleDateString("sv-SE")));
	await sheet.getByRole("button", { name: "Start goal" }).click();
	await page.getByRole("button", { name: /^(Start reading|Continue|Open reader)/ }).click();
	await reader.expectLoaded(page);
	await reader.setPaginationStyle(page, "page");

	const ordinary = await dividerLayout(page);
	expect(ordinary.shown).toBe(true);
	expect(ordinary.width).toBe(ordinary.widthWithout);

	// Shrink the page until the paragraph ends within a divider's height of its bottom.
	let height = page.viewportSize()?.height ?? 720;
	let layout = ordinary;
	for (
		let i = 0;
		i < 40 && !(layout.gapBelow >= 0 && layout.gapBelow < layout.dividerHeight);
		i++
	) {
		height -= layout.gapBelow > 200 ? 37 : Math.max(1, Math.round(layout.gapBelow / 2));
		await page.setViewportSize({ width: 390, height });
		const chunkBottom = () =>
			page.evaluate(
				() =>
					document.querySelector("[data-chunk-index]")?.getBoundingClientRect().bottom ??
					Number.POSITIVE_INFINITY,
			);
		await expect.poll(chunkBottom).toBeLessThanOrEqual(height);
		layout = await dividerLayout(page);
	}
	expect(layout.gapBelow).toBeLessThan(layout.dividerHeight);
	await expect.poll(async () => (await dividerLayout(page)).shown).toBe(false);
	expect(layout.width).toBe(layout.widthWithout);
});
