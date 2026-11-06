import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, seedBigBook } from "./helpers/big-book";
import { CHAPTER_NOVEL_TITLE, seedChapterNovel } from "./helpers/chapter-novel";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { emulateTextZoom, zoomedSizes } from "./helpers/text-zoom";
import { reader } from "./page-objects/reader";

/**
 * One real-browser flow per reading mode: a position is saved, and a reload or
 * a reopen resumes on it. The case matrix behind saving lives in the unit
 * tests (persisted-word, pending-position, external-position, use-anchor-hold)
 * and the trimmed position-* specs.
 *
 * The font-scale reloads stand in for Android recreating the activity when the
 * system font size changes (fontScale is not in its configChanges).
 */

test.use({ viewport: { width: 412, height: 915 } });

const savedWord = async (page: Page) =>
	(await reader.savedRow(page, reader.bookIdFromUrl(page)))?.wordPosition;

async function reloadAtDoubleFontScale(page: Page) {
	await emulateTextZoom(page, 2);
	await page.reload();
	await reader.expectLoaded(page);
	expect(await zoomedSizes(page), "the zoom took: root and reading text doubled").toEqual({
		root: "32px",
		readingText: "32px",
	});
}

/** The first word of "Paragraph <n>", read from the rendered spans. */
const paragraphStartWord = (page: Page, n: number) =>
	page.evaluate((n) => {
		const spans = [...document.querySelectorAll<HTMLElement>("span[data-word]")];
		const start = spans.find(
			(s, i) =>
				s.textContent?.trim() === "Paragraph" && spans[i + 1]?.textContent?.trim() === `${n}`,
		);
		if (!start) throw new Error(`No rendered Paragraph ${n}`);
		return Number(start.dataset.word);
	}, n);

const firstParagraphLines = (page: Page) =>
	page.evaluate(() => {
		const p = document.querySelector(".reader-paragraph");
		if (!p) return 0;
		const range = document.createRange();
		range.selectNodeContents(p);
		return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
	});

test("scroll: a settled scroll saves, a reload resumes there, and so does a font scale change", async ({
	page,
}) => {
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	await reader.waitPositionQuiet(page);
	const word = await paragraphStartWord(page, 3);
	const linesBefore = await firstParagraphLines(page);
	const settles = await reader.settleCount(page);

	await reader.wheelTargetTo(page, page.locator(`span[data-word="${word}"]`), "top");
	await reader.waitForSettleAbove(page, settles);
	await reader.waitPositionQuiet(page);
	expect(await savedWord(page), "the settle saved the paragraph's first word").toBe(word);

	await page.reload();
	await reader.expectLoaded(page);
	await expect.poll(() => reader.scrollModeTopWord(page), { timeout: 10_000 }).toBe(word);

	await reloadAtDoubleFontScale(page);
	await expect(page.locator(`span[data-word="${word}"]`)).toBeInViewport({ timeout: 10_000 });
	expect(await firstParagraphLines(page), "paragraphs wrap to more lines").toBeGreaterThan(
		linesBefore,
	);
	await reader.waitPositionQuiet(page);
	expect(await savedWord(page)).toBe(word);
});

test("page: a TOC jump commits, a turn saves, a reopen lands on it, and so does a font scale change", async ({
	page,
}) => {
	await seedChapterNovel(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await reader.waitOpenSettled(page);
	await reader.setPaginationStyle(page, "page");

	await reader.tocJumpToChapter(page, "Chapter 3");
	await expect(reader.browseBar(page)).toBeVisible();
	const committed = await reader.commitReadFromHere(page);
	await reader.waitPositionQuiet(page);
	expect(await savedWord(page), "Read from here saved the jump").toBe(committed);

	await reader.waitPastJumpGuard(page);
	await reader.turnPages(page, 1);
	const word = await reader.pageModeFirstVisibleWord(page);
	expect(word).toBeGreaterThan(committed);
	await reader.waitPositionQuiet(page);
	expect(await savedWord(page), "the turn saved its page").toBe(word);
	const pagesBefore = await reader.pageModePageCount(page);

	await reader.leaveFlushed(page);
	await openBookFromLibrary(page, CHAPTER_NOVEL_TITLE);
	await expect.poll(() => reader.pageModeFirstVisibleWord(page), { timeout: 10_000 }).toBe(word);

	await reloadAtDoubleFontScale(page);
	await reader.expectWordVisibleInPage(page, word);
	expect(await reader.pageModePageCount(page), "the chunk paginates anew").toBeGreaterThan(
		pagesBefore,
	);
	await reader.waitPositionQuiet(page);
	expect(await savedWord(page)).toBe(word);
});

test("RSVP: a played and paused word is saved, and a reload resumes from it", async ({ page }) => {
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	// Far from the opening screen, so landing back at word 0 would leave the paused word unseen.
	const start = 1000;
	await page.evaluate(
		([id, word]) =>
			window.__lesefluss_e2e_remotePosition?.(id as string, word as number, Date.now()),
		[reader.bookIdFromUrl(page), start] as const,
	);
	await expect(page.locator(`span[data-word="${start}"]`)).toBeInViewport({ timeout: 10_000 });
	await page.addStyleTag({
		content: "[data-sonner-toaster], [data-sonner-toast] { pointer-events: none !important; }",
	});
	await reader.waitPositionQuiet(page);
	const before = (await savedWord(page)) ?? 0;

	await reader.toggleRsvp(page);
	await reader.rsvpTogglePlay(page);
	await reader.waitForNextSave(page);
	await reader.rsvpTogglePlay(page);
	await expect.poll(() => reader.rsvpIsPlaying(page)).toBe(false);
	await reader.waitPositionQuiet(page);
	const paused = await savedWord(page);
	expect(paused, "playing moved the saved word on").toBeGreaterThan(before);

	await page.reload();
	await reader.expectLoaded(page);
	await reader.waitPositionQuiet(page);
	expect(await savedWord(page), "the reload resumed from the paused word").toBeGreaterThanOrEqual(
		paused ?? 0,
	);
	if (await page.locator(".rsvp-display").isVisible()) await reader.toggleRsvp(page);
	await expect(page.locator(`span[data-word="${paused}"]`)).toBeInViewport({ timeout: 10_000 });
});

test("reopen: back to the library and a full reload both land on the saved word and save nothing new", async ({
	page,
}) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);
	await expect(page.locator("body")).toContainText(
		"Chapter 1 opening paragraph anchors the scene.",
	);
	await reader.moveToChapter(page, "2: Second");
	await expect(page.locator("h2", { hasText: "TITLE 2" })).toBeInViewport({ timeout: 5000 });
	await reader.waitPositionQuiet(page);
	const word = await savedWord(page);
	expect(word).toBeDefined();
	const ch2 = page.locator("body").getByText("Chapter 2 opening paragraph anchors the scene.");

	for (const how of ["back", "reload"] as const) {
		// A full reload starts a fresh log; the back navigation keeps the page and its log.
		const from =
			how === "back" ? await page.evaluate(() => window.__lesefluss_e2e_saveLog?.length ?? 0) : 0;
		if (how === "back") await reader.leaveFlushed(page);
		else await page.goto("/tabs/library");
		await openBookFromLibrary(page, title);
		await expect(ch2, `${how}: the reopen lands on chapter 2`).toBeInViewport({ timeout: 10_000 });
		await reader.waitOpenSettled(page);
		await reader.waitPositionQuiet(page);
		const saves = await page.evaluate(
			(from) => (window.__lesefluss_e2e_saveLog ?? []).slice(from).map((s) => s.word),
			from,
		);
		expect(
			saves.filter((w) => w !== word),
			`${how}: saves of another word`,
		).toEqual([]);
		expect(await savedWord(page), `${how}: the row`).toBe(word);
	}
});
