import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, bigBookFixture, FULL_PAGE_FIGURE_BEFORE } from "./helpers/big-book";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * From a 900px wide reader, page mode shows a two-page spread: a turn moves by
 * the whole spread, and crossing the breakpoint repaginates like a rotation.
 *
 * A spread turns about 400 words of this fixture. Quick turns past 2000 words
 * are browsing by design (browse-detector.ts), after which settles stop saving,
 * so tests that check saves keep to a few turns or turn at reading pace.
 */

const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 800, height: 800 };

/** Several 2000-word chunks, so turns also cross chunk boundaries. */
async function openLongBookInPageMode(page: Page, { fakeTts = false } = {}) {
	if (fakeTts) {
		await page.addInitScript(() => {
			window.__lesefluss_e2e_fakeTts = true;
		});
	}
	await page.setViewportSize(WIDE);
	await seedFixture(page, bigBookFixture({ paragraphCount: 200 }), "big.epub");
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	await reader.setPaginationStyle(page, "page");
	await reader.blurFocusedControl(page);
}

const chunkOfWord = (page: Page, word: number) =>
	page.evaluate(
		(w) =>
			document
				.querySelector(`.page-view span[data-word="${w}"]`)
				?.closest("[data-chunk-index]")
				?.getAttribute("data-chunk-index") ?? null,
		word,
	);

/** Runs `move` and waits for the page turn it causes to settle. */
async function settled(page: Page, move: () => Promise<void>) {
	const settles = await reader.settleCount(page);
	await move();
	await reader.waitForSettleAbove(page, settles);
}

const pressKey = (page: Page, key: "ArrowRight" | "ArrowLeft") =>
	settled(page, () => page.keyboard.press(key));

async function pageViewBox(page: Page) {
	const box = await page.locator(".page-view").boundingBox();
	if (!box) throw new Error("No page view");
	return box;
}

/** A quick horizontal touch swipe; a mouse drag over text selects it instead. */
async function touchSwipe(page: Page, fromX: number, toX: number, y: number) {
	const cdp = await page.context().newCDPSession(page);
	try {
		await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: fromX, y }],
		});
		for (let i = 1; i <= 6; i++) {
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x: fromX + ((toX - fromX) * i) / 6, y }],
			});
		}
		await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	} finally {
		await cdp.detach();
	}
}

/** Visible words on the left and on the right page, in DOM order. */
async function wordsPerPage(page: Page): Promise<{ left: number[]; right: number[] }> {
	return page.evaluate(() => {
		const view = document.querySelector<HTMLElement>(".page-view");
		const pages = { left: [] as number[], right: [] as number[] };
		if (!view) return pages;
		const box = view.getBoundingClientRect();
		const mid = box.left + box.width / 2;
		for (const span of view.querySelectorAll<HTMLElement>("span[data-word]")) {
			const r = span.getClientRects()[0];
			if (!r) continue;
			const x = r.left + r.width / 2;
			if (x < box.left || x > box.right) continue;
			pages[x < mid ? "left" : "right"].push(Number(span.dataset.word));
		}
		return pages;
	});
}

/** Two pages side by side: the right half's text all follows the left half's. A
 *  single page's lines run across both halves, so their words interleave. */
async function isSpreadShown(page: Page): Promise<boolean> {
	const { left, right } = await wordsPerPage(page);
	return left.length > 0 && right.length > 0 && Math.min(...right) > Math.max(...left);
}

/** The word read-aloud marks as spoken (a CSS custom highlight), or null. */
const spokenWord = (page: Page) =>
	page.evaluate(() => {
		const range = CSS.highlights.get("tts-word")?.values().next().value as Range | undefined;
		const node = range?.startContainer;
		const el = node instanceof Element ? node : node?.parentElement;
		const span = el?.closest<HTMLElement>("span[data-word]");
		return span ? Number(span.dataset.word) : null;
	});

/** Speaks until the spoken word reaches `word`. */
async function speakTo(page: Page, word: number) {
	await expect
		.poll(
			async () => {
				const spoken = (await spokenWord(page)) ?? -1;
				if (spoken < word) {
					await page.evaluate((n) => window.__lesefluss_e2e_tts?.speak(n), word - spoken);
				}
				return spokenWord(page);
			},
			{ timeout: 10_000 },
		)
		.toBe(word);
}

test("a wide reader shows a two-page spread and a turn moves by the whole spread", async ({
	page,
}) => {
	await openLongBookInPageMode(page);

	expect(await isSpreadShown(page)).toBe(true);

	const before = await reader.pageModeVisibleWords(page);
	await pressKey(page, "ArrowRight");
	const after = await reader.pageModeVisibleWords(page);

	expect(after[0], "the turn neither skips nor repeats a page").toBe(Math.max(...before) + 1);
	await expect.poll(() => reader.lastSavedWord(page)).toBe(after[0]);
});

test("the three tap zones and a swipe work across the whole spread", async ({ page }) => {
	await openLongBookInPageMode(page);
	await pressKey(page, "ArrowRight");
	const start = await reader.pageModeFirstVisibleWord(page);
	const box = await pageViewBox(page);
	const y = box.y + box.height / 2;

	// Right third: the right page's outer part.
	await settled(page, () => page.mouse.click(box.x + box.width - 60, y));
	const next = await reader.pageModeFirstVisibleWord(page);
	expect(next).toBeGreaterThan(start);
	await expect.poll(() => reader.lastSavedWord(page)).toBe(next);

	// Left third: the left page's outer part.
	await settled(page, () => page.mouse.click(box.x + 60, y));
	expect(await reader.pageModeFirstVisibleWord(page)).toBe(start);
	await expect.poll(() => reader.lastSavedWord(page)).toBe(start);

	// Centre: the gutter between the pages toggles the chrome, no turn.
	await page.mouse.click(box.x + box.width / 2, y);
	await expect(reader.progressBar(page)).toBeVisible();
	expect(await reader.pageModeFirstVisibleWord(page)).toBe(start);

	// A swipe of a fifth of the spread (past 22% of one page) turns it.
	await settled(page, () => touchSwipe(page, box.x + box.width * 0.6, box.x + box.width * 0.4, y));
	expect(await reader.pageModeFirstVisibleWord(page)).toBe(next);
	await expect.poll(() => reader.lastSavedWord(page)).toBe(next);
});

test("spread turns stay contiguous across chunk boundaries", async ({ page }) => {
	await openLongBookInPageMode(page);
	const firstChunk = await chunkOfWord(page, await reader.pageModeFirstVisibleWord(page));
	let visible = await reader.pageModeVisibleWords(page);
	let crossed = false;
	for (let i = 0; i < 12 && !crossed; i++) {
		await pressKey(page, "ArrowRight");
		const next = await reader.pageModeVisibleWords(page);
		expect(next[0], `turn ${i + 1} neither skips nor repeats a page`).toBe(
			Math.max(...visible) + 1,
		);
		visible = next;
		crossed = (await chunkOfWord(page, next[0])) !== firstChunk;
	}
	expect(crossed, "the turns reached the next chunk").toBe(true);

	await pressKey(page, "ArrowLeft");
	const back = await reader.pageModeVisibleWords(page);
	expect(Math.max(...back), "turning back lands on the previous chunk's last spread").toBe(
		visible[0] - 1,
	);
});

test("turning spreads at reading pace stays out of browse and saves each one", async ({ page }) => {
	// Fakes the clock so a reading-paced half minute per spread costs no wall time.
	await page.clock.install();
	await openLongBookInPageMode(page);
	for (let i = 0; i < 8; i++) {
		await page.clock.fastForward(30_000);
		await pressKey(page, "ArrowRight");
		const first = await reader.pageModeFirstVisibleWord(page);
		await expect.poll(() => reader.lastSavedWord(page), `turn ${i + 1} is saved`).toBe(first);
	}
	await expect(reader.browseBar(page)).toBeHidden();
});

test("resizing across the spread breakpoint keeps the word and does not save", async ({ page }) => {
	await openLongBookInPageMode(page);
	await pressKey(page, "ArrowRight");
	const word = await reader.pageModeFirstVisibleWord(page);
	await expect.poll(() => reader.lastSavedWord(page)).toBe(word);
	await reader.waitPositionQuiet(page);

	await reader.expectNoSaveDuring(page, async () => {
		await page.setViewportSize(NARROW);
		await expect.poll(() => isSpreadShown(page)).toBe(false);
		await reader.expectWordVisibleInPage(page, word);

		await page.setViewportSize(WIDE);
		await expect.poll(() => reader.pageModeFirstVisibleWord(page)).toBe(word);
		expect(await isSpreadShown(page)).toBe(true);

		await page.setViewportSize(NARROW);
		await reader.expectWordVisibleInPage(page, word);
	});
	expect(await reader.lastSavedWord(page)).toBe(word);

	// The next turn starts from the re-anchored page, not a stale page index. A
	// page without words (a figure) settles nothing, so turn until one saves.
	const saves = await reader.saveCount(page);
	for (let i = 0; i < 3 && (await reader.saveCount(page)) === saves; i++) {
		await page.keyboard.press("ArrowRight");
		await expect.poll(() => reader.pageModeVisibleWords(page)).not.toContain(word);
		await reader.waitPositionQuiet(page);
	}
	const after = await reader.pageModeFirstVisibleWord(page);
	expect(after).toBeGreaterThan(word);
	await expect.poll(() => reader.lastSavedWord(page)).toBe(after);
});

test("a highlight made on the right page sticks to its word", async ({ page }) => {
	await openLongBookInPageMode(page);
	const before = await reader.pageModeFirstVisibleWord(page);
	const word = (await wordsPerPage(page)).right[20];
	const start = await page.locator(`span[data-word="${word}"]`).boundingBox();
	const end = await page.locator(`span[data-word="${word + 2}"]`).boundingBox();
	if (!start || !end) throw new Error("No word boxes");

	const y = start.y + start.height / 2;
	await page.mouse.move(start.x + 2, y);
	await page.mouse.down();
	await page.mouse.move(start.x + 20, y);
	await page.mouse.move(end.x + end.width - 2, end.y + end.height / 2, { steps: 5 });
	await page.mouse.up();
	expect(await reader.applyHighlight(page, "yellow")).toBe(word);

	await reader.expectHighlight(page, word + 2, "yellow");
	expect(await reader.pageModeFirstVisibleWord(page), "selecting did not turn the spread").toBe(
		before,
	);
	expect((await wordsPerPage(page)).right).toContain(word);
});

test("read-aloud follows onto the right page without a turn, and turns the spread after it", async ({
	page,
}) => {
	await openLongBookInPageMode(page, { fakeTts: true });
	await page.getByRole("button", { name: "Listen", exact: true }).click();
	await expect.poll(() => page.evaluate(() => window.__lesefluss_e2e_tts?.starts() ?? 0)).toBe(1);
	const { left, right } = await wordsPerPage(page);

	await speakTo(page, right[0]);
	expect(await wordsPerPage(page), "the right page is followed in place").toEqual({ left, right });

	await speakTo(page, Math.max(...right) + 1);
	await expect.poll(() => reader.pageModeFirstVisibleWord(page)).toBe(Math.max(...right) + 1);
});

test("a full-page figure takes one page of a spread", async ({ page }) => {
	await openLongBookInPageMode(page);
	const figure = page.locator(`img[alt="Figure ${FULL_PAGE_FIGURE_BEFORE}"]`);
	const isOnSpread = async () => {
		const box = await figure.boundingBox();
		const view = await pageViewBox(page);
		return !!box && box.x >= view.x && box.x + box.width <= view.x + view.width;
	};
	for (let i = 0; i < 6 && !(await isOnSpread()); i++) await pressKey(page, "ArrowRight");
	expect(await isOnSpread(), "the turns reached the figure").toBe(true);

	const box = await figure.boundingBox();
	const view = await pageViewBox(page);
	if (!box) throw new Error("No figure box");
	const mid = view.x + view.width / 2;
	expect(box.x + box.width <= mid || box.x >= mid, "the figure stays on one page").toBe(true);

	const visible = await reader.pageModeVisibleWords(page);
	await pressKey(page, "ArrowRight");
	expect(await reader.pageModeFirstVisibleWord(page)).toBe(Math.max(...visible) + 1);
});
