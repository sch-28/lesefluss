import { expect, type Page, test } from "@playwright/test";
import {
	BIG_BOOK_TITLE,
	bigBookFixture,
	openBigBookInPageMode,
	seedBigBook,
} from "./helpers/big-book";
import { applyRemoteSettings } from "./helpers/remote-settings";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

const PHONE = { width: 420, height: 900 };
/** A two-page spread, as in page-mode-spread.spec. */
const SPREAD = { width: 1280, height: 800 };
const SETTLE_MS = 2000;

const ruler = (page: Page) => page.locator(".reading-ruler");
const band = (page: Page) => page.locator(".reading-ruler-band");

/** An Off/On row of the appearance popover, queried like the popover's other rows. */
async function setPopoverSwitch(page: Page, row: string, on: boolean) {
	await reader.openAppearance(page);
	await page
		.locator(".ap-row")
		.filter({ hasText: row })
		.getByRole("radio", { name: on ? "On" : "Off" })
		.click();
	await page.keyboard.press("Escape");
	await expect(page.locator(".appearance-popover-content")).toHaveCount(0);
}

const setRuler = (page: Page, on: boolean) => setPopoverSwitch(page, "Reading ruler", on);

/** Every rendered word's box: identical before and after means nothing reflowed or moved. */
async function wordBoxes(page: Page): Promise<string> {
	return page.evaluate(() =>
		[...document.querySelectorAll<HTMLElement>("span[data-word]")]
			.map((span) => {
				const r = span.getBoundingClientRect();
				return `${span.dataset.word}:${Math.round(r.left)},${Math.round(r.top)}`;
			})
			.join(";"),
	);
}

/** Whether the visible band covers `word`'s line on screen. */
async function bandCoversWord(page: Page, word: number): Promise<boolean> {
	return page.evaluate((word) => {
		const root = document.querySelector<HTMLElement>(".reading-ruler");
		const bandEl = document.querySelector(".reading-ruler-band");
		const span = document.querySelector(`span[data-word="${word}"]`);
		if (!root || root.dataset.visible !== "true" || !bandEl || !span) return false;
		const b = bandEl.getBoundingClientRect();
		const clip = (document.querySelector(".page-clip") ?? root).getBoundingClientRect();
		const rects = [...span.getClientRects()].filter((r) => {
			const x = (r.left + r.right) / 2;
			return x >= clip.left && x <= clip.right;
		});
		return rects.some((r) => r.top >= b.top - 1 && r.bottom <= b.bottom + 1);
	}, word);
}

/** Whether the visible band overlaps the first element matching `selector` on screen. */
async function bandOverlaps(page: Page, selector: string): Promise<boolean> {
	return page.evaluate((selector) => {
		const root = document.querySelector<HTMLElement>(".reading-ruler");
		const bandEl = document.querySelector(".reading-ruler-band");
		const el = document.querySelector(selector);
		if (!root || root.dataset.visible !== "true" || !bandEl || !el) return false;
		const b = bandEl.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		return r.top < b.bottom && r.bottom > b.top;
	}, selector);
}

/** Starts recording whether the ruler hides; read with `wasRulerHidden`. */
async function recordRulerHidden(page: Page) {
	await page.evaluate(() => {
		const root = document.querySelector<HTMLElement>(".reading-ruler");
		if (!root) throw new Error("no ruler");
		(window as { __rulerHidden?: boolean }).__rulerHidden = false;
		new MutationObserver(() => {
			if (root.dataset.visible === "false")
				(window as { __rulerHidden?: boolean }).__rulerHidden = true;
		}).observe(root, { attributes: true, attributeFilter: ["data-visible"] });
	});
}

const wasRulerHidden = (page: Page) =>
	page.evaluate(() => (window as { __rulerHidden?: boolean }).__rulerHidden === true);

async function openScrollMidChapter(page: Page) {
	await page.setViewportSize(PHONE);
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	const savePending = reader.waitForNextSave(page);
	await reader.wheel(page, 2500);
	await savePending;
	await reader.waitPositionQuiet(page);
	return reader.scrollModeTopWord(page);
}

test("toggling the ruler mid-chapter in scroll mode moves nothing and saves nothing", async ({
	page,
}) => {
	const word = await openScrollMidChapter(page);
	const saves = await reader.saveRequestCount(page);
	const before = await wordBoxes(page);

	await setRuler(page, true);
	await expect(band(page)).toBeVisible();
	await page.waitForTimeout(SETTLE_MS);
	await setRuler(page, false);
	await expect(ruler(page)).toHaveCount(0);
	await page.waitForTimeout(SETTLE_MS);

	expect(await wordBoxes(page)).toBe(before);
	expect(await reader.lastSavedWord(page)).toBe(word);
	expect(await reader.saveRequestCount(page)).toBe(saves);
});

test("toggling the ruler mid-chapter in page mode keeps the page and saves nothing", async ({
	page,
}) => {
	await page.setViewportSize(PHONE);
	await openBigBookInPageMode(page);
	await reader.turnPages(page, 5);
	await reader.waitPositionQuiet(page);
	const word = await reader.pageModeFirstVisibleWord(page);
	const saved = await reader.lastSavedWord(page);
	const saves = await reader.saveRequestCount(page);
	const before = await wordBoxes(page);

	await setRuler(page, true);
	await expect(band(page)).toBeVisible();
	await page.waitForTimeout(SETTLE_MS);
	await setRuler(page, false);
	await page.waitForTimeout(SETTLE_MS);

	expect(await reader.pageModeFirstVisibleWord(page)).toBe(word);
	expect(await wordBoxes(page)).toBe(before);
	expect(await reader.lastSavedWord(page)).toBe(saved);
	expect(await reader.saveRequestCount(page)).toBe(saves);
});

test("the band sits on a tapped word's line and grows with the line count", async ({ page }) => {
	await openScrollMidChapter(page);
	await setRuler(page, true);
	const word = (await reader.scrollModeTopWord(page)) + 40;
	await page.locator(`span[data-word="${word}"]`).click();
	await expect.poll(() => bandCoversWord(page, word)).toBe(true);
	const oneLine = (await band(page).boundingBox())?.height ?? 0;

	// One step at a time: the setting saves without an optimistic update.
	await reader.stepUpAppearance(page, "Ruler lines");
	await reader.stepUpAppearance(page, "Ruler lines");
	// Edges round separately, so three lines may differ from 3 x one by a pixel or two.
	await expect
		.poll(async () => Math.abs(((await band(page).boundingBox())?.height ?? 0) - oneLine * 3))
		.toBeLessThanOrEqual(2);
	expect(await bandCoversWord(page, word)).toBe(true);
});

test("taps and long presses reach the words under the ruler", async ({ page }) => {
	await openScrollMidChapter(page);
	await setRuler(page, true);
	const word = (await reader.scrollModeTopWord(page)) + 40;
	const span = page.locator(`span[data-word="${word}"]`);
	await span.click();
	await expect.poll(() => bandCoversWord(page, word)).toBe(true);
	const hit = await page.evaluate((word) => {
		const r = document.querySelector(`span[data-word="${word}"]`)?.getBoundingClientRect();
		if (!r) return null;
		const el = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
		return el instanceof HTMLElement ? (el.dataset.word ?? el.className) : null;
	}, word);
	expect(hit).toBe(String(word));

	await reader.touchLongPressOn(page, span);
	await expect(span).toHaveClass(/word-selecting/);
	await expect(reader.selectionToolbar(page)).toBeVisible();
});

test("in page mode the ruler hides while the page slides and returns on the settled page", async ({
	page,
}) => {
	await page.setViewportSize(PHONE);
	await openBigBookInPageMode(page);
	await setRuler(page, true);
	await expect(ruler(page)).toHaveAttribute("data-visible", "true");
	const before = await reader.pageModeFirstVisibleWord(page);

	// The popover hands focus back to its trigger, which swallows arrow keys.
	await reader.blurFocusedControl(page);
	await recordRulerHidden(page);
	await page.keyboard.press("ArrowRight");
	await reader.waitPositionQuiet(page);

	expect(await reader.pageModeFirstVisibleWord(page)).not.toBe(before);
	expect(await wasRulerHidden(page)).toBe(true);
	await expect(ruler(page)).toHaveAttribute("data-visible", "true");
});

test("on a chapter's first page the band marks the heading, also after a font size step", async ({
	page,
}) => {
	await page.setViewportSize(PHONE);
	await openBigBookInPageMode(page);
	await setRuler(page, true);
	await expect(ruler(page)).toHaveAttribute("data-visible", "true");

	await expect.poll(() => bandOverlaps(page, ".page-view .reader-heading")).toBe(true);

	// Through sync, not the popover, whose closing would commit again. The reflow lands
	// on the same page 0: no new page index, so only the landing itself brings it back.
	const headingSize = () =>
		page.evaluate(() => {
			const heading = document.querySelector(".page-view .reader-heading");
			return heading ? getComputedStyle(heading).fontSize : "";
		});
	const sizeBefore = await headingSize();
	await recordRulerHidden(page);
	await applyRemoteSettings(page, { readerFontSize: 22 });
	await expect.poll(headingSize).not.toBe(sizeBefore);
	await expect.poll(() => wasRulerHidden(page)).toBe(true);
	await expect(ruler(page)).toHaveAttribute("data-visible", "true", { timeout: 10_000 });
	await expect.poll(() => bandOverlaps(page, ".page-view .reader-heading")).toBe(true);
});

test("during read-aloud in page mode the band returns after quick page turns", async ({ page }) => {
	await page.setViewportSize(PHONE);
	await page.addInitScript(() => {
		window.__lesefluss_e2e_fakeTts = true;
	});
	const title = await seedFixture(page, bigBookFixture(), "big.epub");
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.setPaginationStyle(page, "page");
	await reader.waitPositionQuiet(page);
	await setRuler(page, true);
	await page.getByRole("button", { name: "Listen", exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0)).toBe(1);
	const start = await reader.pageModeFirstVisibleWord(page);

	// Words faster than the page slide: each turn's animation is cut short by the next
	// word. A ruler left waiting for a stop that is never reported stays hidden until some
	// unrelated commit (the throttled save, every 2 s), not just for the slide.
	const longestHiddenMs = await page.evaluate(async () => {
		const root = document.querySelector<HTMLElement>(".reading-ruler");
		if (!root) throw new Error("no ruler");
		let hiddenSince: number | null = null;
		let longest = 0;
		for (let i = 0; i < 400; i++) {
			window.__lesefluss_e2e_tts?.speak(1);
			await new Promise((resolve) => setTimeout(resolve, 30));
			const now = performance.now();
			if (root.dataset.visible === "false") hiddenSince ??= now;
			else if (hiddenSince !== null) {
				longest = Math.max(longest, now - hiddenSince);
				hiddenSince = null;
			}
		}
		return hiddenSince === null ? longest : Math.max(longest, performance.now() - hiddenSince);
	});
	expect(await reader.pageModeFirstVisibleWord(page)).not.toBe(start);
	expect(longestHiddenMs).toBeLessThan(800);
});

test("in a two-page spread the band marks one page only", async ({ page }) => {
	await page.setViewportSize(SPREAD);
	await openBigBookInPageMode(page);
	await setRuler(page, true);
	await expect(ruler(page)).toHaveAttribute("data-visible", "true");
	const clipWidth = await page
		.locator(".page-clip")
		.evaluate((el) => el.getBoundingClientRect().width);
	const bandWidth = (await band(page).boundingBox())?.width ?? 0;
	expect(bandWidth).toBeGreaterThan(0);
	expect(bandWidth).toBeLessThan(clipWidth * 0.6);
});

for (const mode of ["scroll", "page"] as const) {
	test(`reopening after using the ruler restores the same first word (${mode} mode)`, async ({
		page,
	}) => {
		await page.setViewportSize(PHONE);
		if (mode === "page") {
			await openBigBookInPageMode(page);
			await reader.turnPages(page, 3);
		} else {
			await openScrollMidChapter(page);
		}
		await reader.waitPositionQuiet(page);
		const first = () =>
			mode === "page" ? reader.pageModeFirstVisibleWord(page) : reader.scrollModeTopWord(page);
		const word = await first();

		await setRuler(page, true);
		await reader.stepUpAppearance(page, "Ruler lines");
		await expect(band(page)).toBeVisible();

		await reader.leaveFlushed(page);
		await openBookFromLibrary(page, BIG_BOOK_TITLE);
		await reader.expectLoaded(page);
		if (mode === "page") {
			await expect.poll(first, { timeout: 10_000 }).toBe(word);
		} else {
			await reader.waitOpenSettled(page);
			expect(await first()).toBe(word);
		}
	});
}

test("the ruler stays on its word's line after a font size change and a resize", async ({
	page,
}) => {
	await openScrollMidChapter(page);
	await setRuler(page, true);
	const word = (await reader.scrollModeTopWord(page)) + 20;
	await page.locator(`span[data-word="${word}"]`).click();
	await expect.poll(() => bandCoversWord(page, word)).toBe(true);

	await reader.increaseFontSize(page);
	await expect.poll(() => bandCoversWord(page, word), { timeout: 10_000 }).toBe(true);
	await page.setViewportSize({ width: 600, height: 900 });
	await expect.poll(() => bandCoversWord(page, word), { timeout: 10_000 }).toBe(true);
});

test("during read-aloud the band follows the spoken word and adds no saves", async ({ page }) => {
	await page.setViewportSize(PHONE);
	await page.addInitScript(() => {
		window.__lesefluss_e2e_fakeTts = true;
	});
	const title = await seedFixture(page, bigBookFixture(), "big.epub");
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	await setRuler(page, true);
	await page.getByRole("button", { name: "Listen", exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0)).toBe(1);
	const ownSaves = () =>
		page.evaluate(
			() => window.__lesefluss_e2e_saveLog?.filter((s) => s.source !== "read-aloud").length ?? 0,
		);
	const before = await ownSaves();
	const spokenWord = () =>
		page.evaluate(() => {
			const range = CSS.highlights.get("tts-word")?.values().next().value as Range | undefined;
			// selectNodeContents(span): the range starts in the span itself.
			const node = range?.startContainer;
			const el = node instanceof Element ? node : node?.parentElement;
			const span = el?.closest<HTMLElement>("span[data-word]");
			return span ? Number(span.dataset.word) : null;
		});

	// Past the opening headings, which render no word spans to read the mark from.
	for (const words of [5, 30, 60]) {
		await page.evaluate((words) => window.__lesefluss_e2e_tts?.speak(words), words);
		await expect.poll(spokenWord).not.toBeNull();
		const word = await spokenWord();
		if (word === null) throw new Error("no spoken word");
		await expect.poll(() => bandCoversWord(page, word)).toBe(true);
	}
	expect(await ownSaves()).toBe(before);
});

test("under e-ink the ruler is an outline without dimming, and it never animates", async ({
	page,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await openScrollMidChapter(page);
	await setRuler(page, true);
	await expect(band(page)).toBeVisible();
	expect(await band(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");

	await setPopoverSwitch(page, "E-ink display", true);
	await expect(page.locator("html")).toHaveClass(/\beink\b/);
	await expect(page.locator(".reading-ruler-dim").first()).toBeHidden();
	expect(await band(page).evaluate((el) => getComputedStyle(el).outlineColor)).toBe("rgb(0, 0, 0)");
});
