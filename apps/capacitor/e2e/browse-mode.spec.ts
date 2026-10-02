import type { EpubFixture } from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, test } from "@playwright/test";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

const TITLE = "Browse Book";
const PARAGRAPHS_PER_CHAPTER = 150;

/** Two chapters, each well over a screen and together past the fast-scroll
 *  distance, so "where am I" is unambiguous from what is in the viewport. */
function browseFixture(): EpubFixture {
	const chapter = (n: number) => {
		const paragraphs = Array.from(
			{ length: PARAGRAPHS_PER_CHAPTER },
			(_, i) =>
				`<p>Chapter ${n} paragraph ${i + 1} carries enough filler words to make the chapter long, so a jump or a fast scroll covers real distance.</p>`,
		);
		return `<h1>TITLE ${n}</h1><p>Chapter ${n} opening line.</p>${paragraphs.join("")}`;
	};
	return {
		title: TITLE,
		chapters: [
			{ id: "c1", href: "c1.htm", body: chapter(1) },
			{ id: "c2", href: "c2.htm", body: chapter(2) },
		],
		navPoints: [
			{ label: "1: First", href: "c1.htm" },
			{ label: "2: Second", href: "c2.htm" },
		],
	};
}

const opening = (page: Page, n: number) => page.getByText(`Chapter ${n} opening line.`);

async function openSeeded(page: Page): Promise<void> {
	await seedFixture(page, browseFixture(), "browse.epub");
	await openBookFromLibrary(page, TITLE);
	await reader.expectLoaded(page);
	await page.waitForTimeout(reader.OPEN_SETTLE_MS);
}

test("a TOC jump browses without saving, and reopening resumes where reading stopped", async ({
	page,
}) => {
	await openSeeded(page);
	const baseline = await reader.saveCount(page);

	await reader.tocJumpToChapter(page, "2: Second");
	await expect(opening(page, 2)).toBeInViewport({ timeout: 5000 });
	await expect(reader.browseBar(page)).toBeVisible();
	await reader.waitPastJumpGuard(page);
	expect(await reader.saveCount(page)).toBe(baseline);

	await page.goto("/tabs/library");
	await openBookFromLibrary(page, TITLE);
	await expect(opening(page, 1)).toBeInViewport({ timeout: 10_000 });
	await expect(reader.browseBar(page)).toBeHidden();
});

test("Back to N% returns to the anchor without saving", async ({ page }) => {
	await openSeeded(page);
	const baseline = await reader.saveCount(page);

	await reader.tocJumpToChapter(page, "2: Second");
	await expect(opening(page, 2)).toBeInViewport({ timeout: 5000 });
	await reader.browseBack(page);

	await expect(opening(page, 1)).toBeInViewport({ timeout: 5000 });
	await expect(reader.browseBar(page)).toBeHidden();
	await reader.waitPastJumpGuard(page);
	expect(await reader.saveCount(page)).toBe(baseline);
});

test("Read from here commits the browsed position", async ({ page }) => {
	await openSeeded(page);

	await reader.tocJumpToChapter(page, "2: Second");
	await expect(opening(page, 2)).toBeInViewport({ timeout: 5000 });
	const savePending = reader.waitForNextSave(page);
	await reader.readFromHere(page);
	await savePending;
	await expect(reader.browseBar(page)).toBeHidden();

	await page.goto("/tabs/library");
	await openBookFromLibrary(page, TITLE);
	await expect(opening(page, 2)).toBeInViewport({ timeout: 10_000 });
});

async function reopen(page: Page): Promise<void> {
	await page.goto("/tabs/library");
	await openBookFromLibrary(page, TITLE);
	await reader.expectLoaded(page);
}

test("the toolbar button freezes the position while scrolling around", async ({ page }) => {
	await openSeeded(page);
	const baseline = await reader.saveCount(page);

	await page.getByTestId("browse-toggle").click();
	await expect(reader.browseBar(page)).toBeVisible();
	await reader.wheel(page, 600);
	await expect(opening(page, 1)).not.toBeInViewport();
	await page.waitForTimeout(1_000);
	expect(await reader.saveCount(page)).toBe(baseline);

	await reopen(page);
	await expect(opening(page, 1)).toBeInViewport({ timeout: 10_000 });
});

test("Read from here commits a word tapped while browsing", async ({ page }) => {
	await openSeeded(page);

	await reader.tocJumpToChapter(page, "2: Second");
	await expect(opening(page, 2)).toBeInViewport({ timeout: 5000 });
	await reader.waitPastJumpGuard(page);
	const tapped = page
		.locator("p", { hasText: "Chapter 2 paragraph 1 carries" })
		.locator("span[data-word]")
		.nth(4);
	const tappedWord = await reader.wordPositionIn(tapped);
	await tapped.click();
	const savePending = reader.waitForNextSave(page);
	await reader.readFromHere(page);
	await savePending;
	expect(await reader.lastSavedWord(page)).toBe(tappedWord);
});

test("normal scrolling saves again after going back", async ({ page }) => {
	await openSeeded(page);

	await reader.tocJumpToChapter(page, "2: Second");
	await expect(opening(page, 2)).toBeInViewport({ timeout: 5000 });
	await reader.browseBack(page);
	await expect(opening(page, 1)).toBeInViewport({ timeout: 5000 });
	await reader.waitPastJumpGuard(page);

	await reader.wheel(page, 400);
	await expect(opening(page, 1)).not.toBeInViewport();
	await page.waitForTimeout(1_000);
	await expect(reader.browseBar(page)).toBeHidden();
	const scrolledTo = await reader.scrollModeTopWord(page);

	await reopen(page);
	await expect.poll(() => reader.scrollModeTopWord(page), { timeout: 10_000 }).toBe(scrolledTo);
});

test("a TOC jump from RSVP browses, and Read from here commits it", async ({ page }) => {
	await openSeeded(page);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });

	await reader.tocJumpToChapter(page, "2: Second");
	await expect(opening(page, 2)).toBeInViewport({ timeout: 5000 });
	await expect(reader.browseBar(page)).toBeVisible();
	const savePending = reader.waitForNextSave(page);
	await reader.readFromHere(page);
	await savePending;

	await reopen(page);
	await expect(opening(page, 2)).toBeInViewport({ timeout: 10_000 });
});

test("a TOC jump from RSVP keeps the saved position at the RSVP word", async ({ page }) => {
	await openSeeded(page);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display")).toBeVisible({ timeout: 5000 });
	// Play briefly: playback saves are throttled, so the displayed word runs
	// ahead of the last save and only the jump's pause can persist it.
	await reader.rsvpTogglePlay(page);
	await page.waitForTimeout(800);

	const savePending = reader.waitForNextSave(page);
	await reader.tocJumpToChapter(page, "2: Second");
	await savePending;
	const rsvpWord = await reader.lastSavedWord(page);
	expect(rsvpWord).toBeGreaterThan(0);
	await expect(opening(page, 2)).toBeInViewport({ timeout: 5000 });
	await expect(reader.browseBar(page)).toBeVisible();
	await reader.waitPastJumpGuard(page);
	expect(await reader.lastSavedWord(page)).toBe(rsvpWord);

	await reopen(page);
	await expect
		.poll(() => reader.scrollModeTopWord(page), { timeout: 10_000 })
		.toBeLessThanOrEqual(rsvpWord);
	await expect(opening(page, 2)).not.toBeInViewport();
});

test("a fast long scroll browses and leaving resumes where reading stopped", async ({ page }) => {
	await openSeeded(page);

	await expect(async () => {
		await reader.wheel(page, 3000);
		await page.waitForTimeout(400);
		await expect(reader.browseBar(page)).toBeVisible({ timeout: 100 });
	}).toPass({ timeout: 20_000 });

	await reopen(page);
	await expect(opening(page, 1)).toBeInViewport({ timeout: 10_000 });
});

test("reading on at the browsed spot commits it, and Undo restores the anchor", async ({
	page,
}) => {
	// Fakes Date, performance.now and timers, so the two-minute resume wait
	// costs no wall time.
	await page.clock.install();
	await openSeeded(page);

	await reader.tocJumpToChapter(page, "2: Second");
	await expect(opening(page, 2)).toBeInViewport({ timeout: 5000 });
	await reader.waitPastJumpGuard(page);
	const chapterTwoOpening = await reader.firstWordPositionIn(opening(page, 2));
	// A fresh book opens at word 0, which is the anchor the jump leaves from.
	const anchorWord = 0;

	const toast = page.getByText(/Reading position moved to \d+%/);
	const committed = reader.waitForNextSave(page);
	for (let i = 0; i < 8 && !(await toast.isVisible()); i++) {
		await page.clock.fastForward(45_000);
		await reader.wheel(page, 150);
		await page.waitForTimeout(500);
	}
	await expect(toast).toBeVisible();
	await committed;
	await expect(reader.browseBar(page)).toBeHidden();
	expect(await reader.lastSavedWord(page)).toBeGreaterThan(chapterTwoOpening);

	const undone = reader.waitForNextSave(page);
	await page.getByRole("button", { name: "Undo" }).click();
	await undone;
	expect(await reader.lastSavedWord(page)).toBe(anchorWord);
	await expect(opening(page, 1)).toBeInViewport({ timeout: 5000 });
});
