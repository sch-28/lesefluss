import { expect, type Page, test } from "@playwright/test";
import { isOwnA11yNode } from "./helpers/a11y-audit";
import { bigBookFixture } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * Word taps and long presses after they moved to document-level handling
 * (word-gestures.ts): sighted taps and presses behave as before, by mouse and
 * by touch (whose click comes in a later task), a click with no press before it
 * (what a TalkBack double-tap sends) changes nothing, and book text reaches
 * screen readers as paragraphs, not one node per word.
 */

test.use({ viewport: { width: 420, height: 800 } });

async function openBook(page: Page) {
	const title = await seedFixture(page, bigBookFixture({ paragraphCount: 120 }), "big.epub");
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	await reader.waitPastJumpGuard(page);
}

/** A word on screen, a few lines down. */
const someWord = (page: Page) => page.locator(".reader-paragraph span[data-word]").nth(40);

const wordOf = async (page: Page) => Number(await someWord(page).getAttribute("data-word"));

test("a mouse click on a word makes it the reading position", async ({ page }) => {
	await openBook(page);
	const word = await wordOf(page);
	const saves = await reader.saveCount(page);
	await someWord(page).click();
	await expect(someWord(page)).toHaveClass(/word-active/);
	await reader.waitForSaveAbove(page, saves, 5000);
	expect(await reader.lastSavedWord(page)).toBe(word);
});

test("a click with no press before it, as TalkBack's double-tap sends, changes nothing", async ({
	page,
}) => {
	await openBook(page);
	await reader.expectNoSaveDuring(page, async () => {
		await someWord(page).dispatchEvent("click");
		await someWord(page).dispatchEvent("click");
	});
	await expect(someWord(page)).not.toHaveClass(/word-active/);
	await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a long press on a word still starts a selection", async ({ page }) => {
	await openBook(page);
	await reader.touchLongPressOn(page, someWord(page));
	await expect(page.locator(".selection-toolbar")).toBeVisible();
	await expect(someWord(page)).toHaveClass(/word-selecting/);
});

test("book text reaches screen readers as paragraphs, not one node per word", async ({ page }) => {
	await openBook(page);
	const span = `span[data-word="${await wordOf(page)}"]`;
	expect(await isOwnA11yNode(page, span), "a word span folds into its paragraph").toBe(false);
	expect(await isOwnA11yNode(page, ".reader-paragraph"), "the paragraph is a node").toBe(true);
});

test.describe("by touch", () => {
	test.use({ hasTouch: true });

	test("a tap makes the word the reading position, a second tap looks it up", async ({ page }) => {
		await openBook(page);
		const word = await wordOf(page);
		const saves = await reader.saveCount(page);
		await someWord(page).tap();
		await expect(someWord(page)).toHaveClass(/word-active/);
		await reader.waitForSaveAbove(page, saves, 5000);
		expect(await reader.lastSavedWord(page)).toBe(word);

		await someWord(page).tap();
		await expect(page.getByRole("dialog")).toBeVisible();
	});

	test("a tap in the gap between two words takes the nearer one", async ({ page }) => {
		await openBook(page);
		const gap = await page.evaluate(() => {
			const spans = [
				...document.querySelectorAll<HTMLElement>(".reader-paragraph span[data-word]"),
			];
			for (let i = 40; i < spans.length - 1; i++) {
				const a = spans[i].getBoundingClientRect();
				const b = spans[i + 1].getBoundingClientRect();
				if (Math.abs(a.top - b.top) > 1 || b.left - a.right < 3) continue;
				return {
					x: (a.right + b.left) / 2,
					y: a.top + a.height / 2,
					words: [Number(spans[i].dataset.word), Number(spans[i + 1].dataset.word)],
				};
			}
			return null;
		});
		if (!gap) throw new Error("No gap between two words on one line");
		const saves = await reader.saveCount(page);
		await page.touchscreen.tap(gap.x, gap.y);
		await reader.waitForSaveAbove(page, saves, 5000);
		expect(gap.words).toContain(await reader.lastSavedWord(page));
	});

	test("page mode: a tap on a word in the middle shows the chrome and saves nothing", async ({
		page,
	}) => {
		await openBook(page);
		await reader.setPaginationStyle(page, "page");
		await reader.blurFocusedControl(page);
		await reader.waitPositionQuiet(page);
		const first = await reader.pageModeFirstVisibleWord(page);
		const box = await page.locator(".page-view").boundingBox();
		if (!box) throw new Error("No page view");
		const middle = await page.evaluate(
			({ left, right }) =>
				[...document.querySelectorAll<HTMLElement>(".page-view span[data-word]")].find((s) => {
					const r = s.getBoundingClientRect();
					const x = r.left + r.width / 2;
					return x > left + (right - left) * 0.4 && x < left + (right - left) * 0.6;
				})?.dataset.word,
			{ left: box.x, right: box.x + box.width },
		);
		await reader.expectNoSaveDuring(page, async () => {
			await page.locator(`.page-view span[data-word="${middle}"]`).tap();
			await expect(reader.progressBar(page)).toBeVisible();
		});
		expect(await reader.pageModeFirstVisibleWord(page)).toBe(first);
	});
});

test("page mode: focus on text pages ahead neither scrolls the page nor saves", async ({
	page,
}) => {
	await openBook(page);
	await reader.setPaginationStyle(page, "page");
	await reader.blurFocusedControl(page);
	await reader.waitPositionQuiet(page);
	const first = await reader.pageModeFirstVisibleWord(page);
	const visible = await reader.pageModeVisibleWords(page);
	// A word a few pages on in the current chunk: the one not aria-hidden.
	const ahead = await page.evaluate(
		(last) =>
			Number(
				[
					...document.querySelectorAll<HTMLElement>(
						".page-view [data-chunk-index]:not([aria-hidden]) span[data-word]",
					),
				].find((s) => Number(s.dataset.word) > last + 400)?.dataset.word,
			),
		Math.max(...visible),
	);
	expect(Number.isInteger(ahead)).toBe(true);
	const transform = () =>
		page.locator(".page-view [style*='translateX']").evaluate((el) => el.style.transform);
	const before = await transform();

	await reader.expectNoSaveDuring(page, async () => {
		// What a screen reader's focus does: bring the focused text into view.
		await page.evaluate((word) => {
			document.querySelector(`span[data-word="${word}"]`)?.scrollIntoView();
		}, ahead);
	});

	const scrolled = await page.evaluate((word) => {
		const moved: string[] = [];
		const span = document.querySelector(`span[data-word="${word}"]`);
		for (let e = span?.parentElement ?? null; e; e = e.parentElement) {
			if (e.scrollLeft !== 0 || e.scrollTop !== 0) moved.push(e.className.toString().slice(0, 40));
		}
		const root = document.scrollingElement;
		if (root && (root.scrollLeft !== 0 || root.scrollTop !== 0)) moved.push("root");
		return moved;
	}, ahead);
	expect(scrolled, "no box around the page scrolled").toEqual([]);
	expect(await transform()).toBe(before);
	expect(await reader.pageModeFirstVisibleWord(page)).toBe(first);
});

test("paused RSVP stays within the screen, its word and controls in view", async ({ page }) => {
	await openBook(page);
	await reader.toggleRsvp(page);
	await expect(page.locator(".rsvp-display--paused")).toBeVisible();
	const view = await page.getByTestId("reader-view").boundingBox();
	if (!view) throw new Error("No reader view");
	expect(view.y + view.height, "the reader view ends within the screen").toBeLessThanOrEqual(800);
	await expect(page.locator(".rsvp-focal")).toBeInViewport();
	await expect(page.getByRole("button", { name: "Play" })).toBeInViewport();
});
