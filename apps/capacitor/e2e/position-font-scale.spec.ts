import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, seedBigBook } from "./helpers/big-book";
import { openBookFromLibrary } from "./helpers/seed";
import { emulateTextZoom, zoomedSizes } from "./helpers/text-zoom";
import { reader } from "./page-objects/reader";

/**
 * Android leaves fontScale out of the activity's configChanges, so changing
 * the system font size recreates the activity: the WebView reloads with the
 * text reflowed larger. A reload under a doubled text zoom stands in for it.
 * - After a move that has settled and saved, the reopened reader shows that word.
 * - After a scroll that has not settled yet, only the background flush (pagehide,
 *   or visibilitychange hidden as the app goes to the background) can carry it
 *   over; the save counts inside pagehide show which path saved.
 * - A reload in the middle of a page turn's slide saves no word but the old
 *   page's or the turned-to page's.
 * The real Android pause-to-recreate timing needs a device (TASK-205.7 AC1).
 */

test.use({ viewport: { width: 412, height: 915 } });

async function openInMode(page: Page, mode: "scroll" | "page") {
	await seedBigBook(page);
	await openBookFromLibrary(page, BIG_BOOK_TITLE);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
	if (mode === "page") await reader.setPaginationStyle(page, "page");
	await reader.blurFocusedControl(page);
}

const savedWord = async (page: Page) =>
	(await reader.savedRow(page, reader.bookIdFromUrl(page)))?.wordPosition;

/** Lines the first visible paragraph wraps to: more of them once the text is larger. */
const firstParagraphLines = (page: Page) =>
	page.evaluate(() => {
		const p = document.querySelector(".reader-paragraph");
		if (!p) return 0;
		const range = document.createRange();
		range.selectNodeContents(p);
		return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
	});

/** What going to the background fires before Android tears the activity down. Returns
 *  the save requests that made. */
const goToBackground = (page: Page) =>
	page.evaluate(() => {
		const before = window.__lesefluss_e2e_saveRequests ?? 0;
		Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
		document.dispatchEvent(new Event("visibilitychange"));
		window.dispatchEvent(new PageTransitionEvent("pagehide"));
		return (window.__lesefluss_e2e_saveRequests ?? 0) - before;
	});

async function recreateAtDoubleFontScale(page: Page) {
	await emulateTextZoom(page, 2);
	await page.reload();
	await reader.expectLoaded(page);
	expect(await zoomedSizes(page), "the zoom took: root and reading text doubled").toEqual({
		root: "32px",
		readingText: "32px",
	});
}

test("page mode: a settled turn survives a font scale change, and the pages reflow", async ({
	page,
}) => {
	await openInMode(page, "page");
	await reader.turnPages(page, 3);
	const word = await reader.pageModeFirstVisibleWord(page);
	expect(await reader.lastSavedWord(page)).toBe(word);
	const pagesBefore = await reader.pageModePageCount(page);

	await recreateAtDoubleFontScale(page);
	await reader.expectWordVisibleInPage(page, word);
	expect(await reader.pageModePageCount(page), "the chunk paginates anew").toBeGreaterThan(
		pagesBefore,
	);
	await reader.waitPositionQuiet(page);
	expect(await savedWord(page)).toBe(word);
});

test("scroll mode: a settled scroll survives a font scale change, and the text reflows", async ({
	page,
}) => {
	await openInMode(page, "scroll");
	const linesBefore = await firstParagraphLines(page);
	const settles = await reader.settleCount(page);
	await reader.wheel(page, 1500);
	await reader.waitForSettleAbove(page, settles);
	await reader.waitPositionQuiet(page);
	const word = await reader.lastSavedWord(page);

	await recreateAtDoubleFontScale(page);
	await expect(page.locator(`span[data-word="${word}"]`)).toBeInViewport({ timeout: 10_000 });
	expect(await firstParagraphLines(page), "paragraphs wrap to more lines").toBeGreaterThan(
		linesBefore,
	);
	await reader.waitPositionQuiet(page);
	expect(await savedWord(page)).toBe(word);
});

/**
 * Reloads from inside the page in the first frame the scroll reader has moved
 * 400px, while the finger that scrolls it is still down (dragTheList): no
 * scroll end has come, so no settle can have saved, and only the flush can
 * save the new spot. A wheel won't do: headless Chromium scrolls it at once
 * and its scrollend settles in that same frame. Save requests are counted just
 * before the reload starts, and in a pagehide listener added after the
 * reader's own (at the window they run in the order they were added), so after
 * its flush; both are kept in sessionStorage across the reload. With `background`, the app first goes to
 * the background (visibilitychange hidden + pagehide), counted the same way.
 */
async function reloadMidScroll(page: Page, { background }: { background: boolean }) {
	await page.evaluate((background) => {
		const count = () => String(window.__lesefluss_e2e_saveRequests ?? 0);
		window.addEventListener("pagehide", () => sessionStorage.setItem("after-flush", count()));
		const scroller = [...document.querySelectorAll<HTMLElement>("*")].find(
			(el) =>
				el.querySelector("span[data-word]") &&
				el.scrollHeight > el.clientHeight &&
				["auto", "scroll"].includes(getComputedStyle(el).overflowY),
		);
		if (!scroller) throw new Error("No reader scroller");
		const start = scroller.scrollTop;
		const check = () => {
			if (scroller.scrollTop - start < 400) {
				requestAnimationFrame(check);
				return;
			}
			sessionStorage.setItem("before-flush", count());
			if (background) {
				Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
				document.dispatchEvent(new Event("visibilitychange"));
				window.dispatchEvent(new PageTransitionEvent("pagehide"));
			}
			location.reload();
		};
		requestAnimationFrame(check);
	}, background);
}

/** Drags the scroll reader up by a finger that never lifts; the page reloads under it. */
async function dragTheList(page: Page) {
	const box = await page.getByTestId("reader-view").boundingBox();
	if (!box) throw new Error("No reader view");
	const x = box.x + box.width / 2;
	const y = box.y + box.height * 0.8;
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
	await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
	try {
		for (let step = 1; step <= 20; step++) {
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x, y: y - step * 40 }],
			});
		}
	} catch {
		// The page reloaded mid-drag, as intended; its old session is gone.
	}
}

const pagehideSaves = (page: Page) =>
	page.evaluate(() => ({
		before: Number(sessionStorage.getItem("before-flush")),
		after: Number(sessionStorage.getItem("after-flush")),
	}));

for (const background of [false, true]) {
	const how = background ? "after going to the background" : "on the reload alone";
	test(`scroll mode: a scroll that has not settled is flushed ${how}`, async ({ page }) => {
		await openInMode(page, "scroll");
		await reader.waitPastJumpGuard(page);
		await reader.waitPositionQuiet(page);
		const before = await savedWord(page);
		const requests = await reader.saveRequestCount(page);

		await emulateTextZoom(page, 2);
		await reloadMidScroll(page, { background });
		const reloaded = page.waitForEvent("load");
		await dragTheList(page);
		await reloaded;
		await reader.expectLoaded(page);
		expect(await zoomedSizes(page), "the zoom took").toEqual({ root: "32px", readingText: "32px" });

		const flushed = await pagehideSaves(page);
		expect(flushed.before, "nothing saved while the finger was down").toBe(requests);
		expect(flushed.after, "the flush on the way out requested the save").toBeGreaterThan(requests);
		await reader.waitPositionQuiet(page);
		const after = await savedWord(page);
		expect(after, "the flush carried the scroll over").not.toBe(before);
		await expect(page.locator(`span[data-word="${after}"]`)).toBeInViewport({ timeout: 10_000 });
	});

	test(`page mode: reloading mid-slide ${how} saves nothing but the old or the turned-to page`, async ({
		page,
	}) => {
		await openInMode(page, "page");
		await reader.turnPages(page, 2);
		await reader.waitPositionQuiet(page);
		const before = await savedWord(page);
		const next = Math.max(...(await reader.pageModeVisibleWords(page))) + 1;

		await page.keyboard.press("ArrowRight");
		if (background) await goToBackground(page);
		await recreateAtDoubleFontScale(page);
		await reader.waitPositionQuiet(page);

		const after = await savedWord(page);
		expect([before, next], "the old page or the turned-to one, nothing else").toContain(after);
		if (after !== undefined) await reader.expectWordVisibleInPage(page, after);
	});
}
