import { expect, type Locator, type Page, test } from "@playwright/test";
import { CHAPTER_NOVEL_TITLE, seedChapterNovel } from "./helpers/chapter-novel";
import { openBookFromLibrary } from "./helpers/seed";
import { reader } from "./page-objects/reader";

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 1920, height: 1080 });
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
});

test("the reader title's line leaves room for descenders", async ({ page }) => {
	const title = page.getByTestId("reader-bar").locator("h1");
	const { lineHeight, fontSize } = await title.evaluate((el) => {
		const style = getComputedStyle(el);
		return {
			lineHeight: Number.parseFloat(style.lineHeight),
			fontSize: Number.parseFloat(style.fontSize),
		};
	});
	expect(lineHeight).toBeGreaterThanOrEqual(fontSize * 1.2);
});

test("on desktop the header row and the progress footer sit on the text column", async ({
	page,
}) => {
	const boxOf = async (selector: string) => {
		const box = await page.locator(selector).first().boundingBox();
		if (!box) throw new Error(`${selector} is not rendered`);
		return { x: Math.round(box.x), width: Math.round(box.width) };
	};
	const column = await boxOf(".reader-scroll-content");
	expect(column.width).toBeLessThan(1920 / 2);
	expect(await boxOf('[data-testid="reader-bar"] > div')).toEqual(column);
	expect(await boxOf(".reader-progress-bar")).toEqual(column);
	const headerBorders = await page
		.getByTestId("reader-bar")
		.evaluate((bar) => [
			getComputedStyle(bar).borderBottomWidth,
			getComputedStyle(bar.firstElementChild as Element).borderBottomWidth,
		]);
	expect(headerBorders).toEqual(["0px", "1px"]);
});

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: Locator): Promise<Box> {
	const box = await locator.first().boundingBox();
	if (!box) throw new Error("not rendered");
	return box;
}

/** The top of the first and the bottom of the last line on the visible page or spread. */
async function textExtent(page: Page): Promise<{ top: number; bottom: number }> {
	return page.locator(".page-clip").evaluate((clip) => {
		const area = clip.getBoundingClientRect();
		let top = Number.POSITIVE_INFINITY;
		let bottom = Number.NEGATIVE_INFINITY;
		for (const span of clip.querySelectorAll("span[data-word]")) {
			for (const r of span.getClientRects()) {
				if (r.right <= area.left || r.left >= area.right) continue;
				top = Math.min(top, r.top);
				bottom = Math.max(bottom, r.bottom);
			}
		}
		return { top, bottom };
	});
}

for (const size of [
	{ width: 1262, height: 606 },
	{ width: 1920, height: 1080 },
	{ width: 2560, height: 1440 },
]) {
	test(`a page-mode spread at ${size.width}x${size.height} has its header and footer on its edges and balanced room around its text`, async ({
		page,
	}) => {
		await page.setViewportSize(size);
		await reader.setPaginationStyle(page, "page");
		await reader.blurFocusedControl(page);
		await reader.pageModeFirstVisibleWord(page);

		const spread = await boxOf(page.locator(".page-view"));
		const row = await boxOf(page.locator('[data-testid="reader-bar"] > div'));
		const footer = await boxOf(reader.progressBar(page));
		for (const box of [row, footer]) {
			expect(Math.round(box.x)).toBe(Math.round(spread.x));
			expect(Math.round(box.width)).toBe(Math.round(spread.width));
		}
		await expect(
			reader.progressBar(page).getByRole("slider", { name: "Reading progress" }),
		).toBeVisible();

		const header = await boxOf(page.getByTestId("reader-bar"));
		const text = await textExtent(page);
		const above = text.top - (header.y + header.height);
		const below = footer.y - text.bottom;
		expect(above).toBeGreaterThan(8);
		expect(below).toBeGreaterThan(8);
		expect(Math.abs(above - below)).toBeLessThanOrEqual(24);
	});
}

test("in RSVP the header, the context text and the footer share one left and right edge", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1262, height: 606 });
	await reader.toggleRsvp(page);
	const context = page.locator(".rsvp-context-inline").first();
	await expect(context).toBeVisible();

	const bar = page.getByTestId("reader-bar");
	const back = await boxOf(bar.getByRole("button", { name: "Back" }).locator("svg"));
	const more = await boxOf(bar.getByRole("button", { name: "More actions" }).locator("svg"));
	const text = await boxOf(context);
	const track = await boxOf(page.locator(".reader-progress-bar .reader-progress-fill-track"));
	for (const box of [back, text]) expect(Math.abs(box.x - track.x)).toBeLessThanOrEqual(4);
	for (const box of [more, text]) {
		expect(Math.abs(box.x + box.width - (track.x + track.width))).toBeLessThanOrEqual(4);
	}
});
