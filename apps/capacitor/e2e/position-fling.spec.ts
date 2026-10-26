import { expect } from "@playwright/test";
import { bigBookFixture } from "./helpers/big-book";
import { test } from "./helpers/framed-page";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * A fling keeps scrolling after the finger lifts, with no input events. When a
 * frame takes longer than VList's 150ms scroll-end debounce (a slow device, any
 * jank), a scroll end fires mid-momentum. That settle may save the word it sees,
 * but the momentum must go on to its real end, and that end must be saved:
 * the view never pulled back to the mid-fling word.
 */

const PHONE = { width: 390, height: 844 };
const STALL_FRAME_MS = 200;
// Past the momentum's end, any correction and the settle that follows.
const IDLE_MS = 3000;

test("a fling that stalls mid-momentum saves where it really ends, without pulling back", async ({
	framedPage,
}) => {
	test.setTimeout(120_000);
	const { page, setFrameMs } = await framedPage({ viewport: PHONE, hasTouch: true });
	const title = await seedFixture(page, bigBookFixture({ paragraphCount: 200 }), "big.epub");
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);

	const before = await reader.scrollModeTopWord(page);
	await page.evaluate(() => {
		const w = window as unknown as { __furthestTop: number };
		w.__furthestTop = 0;
		document.addEventListener(
			"scroll",
			(e) => {
				const top = (e.target as HTMLElement).scrollTop ?? 0;
				w.__furthestTop = Math.max(w.__furthestTop, top);
			},
			{ capture: true },
		);
	});
	const cdp = await page.context().newCDPSession(page);
	await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
	const x = PHONE.width / 2;
	await cdp.send("Input.dispatchTouchEvent", {
		type: "touchStart",
		touchPoints: [{ x, y: 700 }],
	});
	for (let y = 640; y >= 220; y -= 60) {
		await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
	}
	await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	setFrameMs(STALL_FRAME_MS);
	// The momentum runs on through these slow frames, each past the scroll-end debounce.
	await page.waitForTimeout(1500);
	setFrameMs(16);
	await page.waitForTimeout(IDLE_MS);

	const restingTop = await reader.scrollModeTopWord(page);
	expect(restingTop, "the fling moved the view").toBeGreaterThan(before);
	const [furthest, resting] = await page.evaluate(() => [
		(window as unknown as { __furthestTop: number }).__furthestTop,
		document.querySelector(".reader-scroll-content")?.firstElementChild?.scrollTop ?? 0,
	]);
	expect(resting, "not pulled back from where the momentum ended").toBeGreaterThanOrEqual(
		furthest - 2,
	);
	await page.waitForTimeout(IDLE_MS);
	expect(await reader.scrollModeTopWord(page), "the view stays where the fling ended").toBe(
		restingTop,
	);
	expect(await reader.lastSavedWord(page), "the fling's real end is saved").toBe(restingTop);
	const saves = await page.evaluate(() => window.__lesefluss_e2e_saveLog ?? []);
	expect(saves.length, "the fling saved something").toBeGreaterThan(0);
});
