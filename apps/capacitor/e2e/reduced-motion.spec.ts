import { expect, type Page, test } from "@playwright/test";
import { bigBookFixture } from "./helpers/big-book";
import { elementsInMotion } from "./helpers/motion";
import { openBookFromLibrary, seedFixture } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/**
 * With the OS asking for reduced motion (Android "Remove animations" reaches the
 * WebView as prefers-reduced-motion: reduce), nothing slides, fades or scrolls
 * smoothly (a spinner keeps turning), and page turns still save exactly the
 * page they land on. The smooth jump has a no-preference control that sees motion.
 */

test.use({ viewport: { width: 420, height: 800 } });

async function seedAndOpen(page: Page) {
	const title = await seedFixture(page, bigBookFixture({ paragraphCount: 120 }), "big.epub");
	await openBookFromLibrary(page, title);
	await reader.expectLoaded(page);
	await reader.waitOpenSettled(page);
}

/** Settles a key turn produced before the key handler returned: 0 for a turn still sliding. */
const settlesInTheKeysOwnTask = (page: Page) =>
	page.evaluate(() => {
		const before = window.__lesefluss_e2e_settles ?? 0;
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		return (window.__lesefluss_e2e_settles ?? 0) - before;
	});

/** Delivers a BLE device position a screen further on, which the reader follows with a smooth jump. */
async function followDevicePositionScrolls(page: Page): Promise<number[]> {
	await reader.waitPastJumpGuard(page);
	const word = await page.evaluate(() => {
		const below = [...document.querySelectorAll<HTMLElement>("span[data-word]")].find(
			(span) => span.getBoundingClientRect().top > window.innerHeight * 0.7,
		);
		return Number(below?.dataset.word);
	});
	expect(Number.isInteger(word)).toBe(true);
	await reader.recordScrolls(page);
	await page.evaluate((word) => window.__lesefluss_e2e_devicePosition?.(word), word);
	await expect.poll(async () => (await reader.recordedScrolls(page)).length).toBeGreaterThan(0);
	await page.waitForTimeout(600);
	return reader.recordedScrolls(page);
}

test.describe("prefers-reduced-motion: reduce", () => {
	test.use({ contextOptions: { reducedMotion: "reduce" } });

	test("the library, the appearance popover and the annotations drawer don't move", async ({
		page,
	}) => {
		const title = await seedFixture(page, bigBookFixture(), "big.epub");
		await expect(page.locator("html")).toHaveClass(/\breduce-motion\b/);
		await expect(page.locator(`[data-book-title="${title}"]`)).toBeVisible();
		expect(await elementsInMotion(page, { allowSpinners: true }), "library").toEqual([]);

		await openBookFromLibrary(page, title);
		await reader.expectLoaded(page);
		await reader.openAppearance(page);
		expect(await elementsInMotion(page, { allowSpinners: true }), "popover").toEqual([]);
		await page.keyboard.press("Escape");
		await expect(page.locator(".appearance-popover-content")).toHaveCount(0);

		await page.getByRole("button", { name: "Contents and annotations" }).click();
		await expect(page.locator('[data-slot="drawer-content"]')).toBeVisible();
		expect(await elementsInMotion(page, { allowSpinners: true }), "drawer").toEqual([]);
	});

	test("page turns settle within the key press, and each saves the page it lands on", async ({
		page,
	}) => {
		await seedAndOpen(page);
		await reader.setPaginationStyle(page, "page");
		await reader.blurFocusedControl(page);
		const wrapper = page.locator(".page-view [style*='translateX']");

		let visible = await reader.pageModeVisibleWords(page);
		for (let i = 0; i < 3; i++) {
			const saves = await reader.saveCount(page);
			const before = await wrapper.evaluate((el) => getComputedStyle(el).transform);
			expect(await settlesInTheKeysOwnTask(page), "no slide to wait for").toBe(1);
			const after = await wrapper.evaluate((el) => ({
				transform: getComputedStyle(el).transform,
				transition: getComputedStyle(el).transitionDuration,
			}));
			expect(after.transform).not.toBe(before);
			expect(after.transition).toBe("0s");

			await reader.waitForSaveAbove(page, saves, 5000);
			const next = await reader.pageModeVisibleWords(page);
			expect(next[0], "the turn neither skips nor repeats a page").toBe(Math.max(...visible) + 1);
			expect(await reader.lastSavedWord(page)).toBe(next[0]);
			visible = next;
		}
	});

	test("a smooth jump (a BLE device's position) lands at once", async ({ page }) => {
		await seedAndOpen(page);
		const scrolls = await followDevicePositionScrolls(page);
		expect(scrolls[0], "the first scroll already landed").toBe(scrolls.at(-1));
	});
});

test.describe("prefers-reduced-motion: no-preference", () => {
	test.use({ contextOptions: { reducedMotion: "no-preference" } });

	test("a smooth jump (a BLE device's position) glides", async ({ page }) => {
		await seedAndOpen(page);
		const scrolls = await followDevicePositionScrolls(page);
		expect(scrolls[0], "the first frame is only part of the way").not.toBe(scrolls.at(-1));
	});
});
