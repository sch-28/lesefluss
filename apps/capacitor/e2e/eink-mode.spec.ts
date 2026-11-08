import { expect, type Page, test } from "@playwright/test";
import { BIG_BOOK_TITLE, seedBigBook } from "./helpers/big-book";
import { elementsInMotion } from "./helpers/motion";
import { openBookFromLibrary, resetStorage } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/** A 6-inch budget reader, and the Boox Nova Air 2. */
const SMALL_READER = { width: 480, height: 640 };
const LARGE_READER_PORTRAIT = { width: 749, height: 998 };

async function freshInstallAtLibrary(page: Page) {
	await resetStorage(page);
	await page.goto("/");
	await page.waitForURL(/\/onboarding/, { timeout: 10_000 });
	await page.getByRole("button", { name: "Skip onboarding" }).click();
	await page.waitForURL(/\/tabs\/library/, { timeout: 10_000 });
}

async function turnOnEinkMode(page: Page) {
	await page.goto("/tabs/settings/general");
	await page.locator("#eink-mode").click();
	await expect(page.locator("#eink-mode")).toHaveAttribute("data-state", "checked");
	await expect(page.locator("html")).toHaveClass(/\beink\b/);
}

/** Every element on the page that still moves, blurs or casts a shadow. */
async function elementsWithEffects(page: Page): Promise<string[]> {
	const effects = await page.evaluate(() => {
		const offenders: string[] = [];
		const describe = (el: Element, what: string) =>
			`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)}: ${what}`;
		for (const el of document.querySelectorAll("*")) {
			const style = getComputedStyle(el);
			if (style.backdropFilter !== "none") offenders.push(describe(el, "backdrop-filter"));
			if (style.boxShadow !== "none") offenders.push(describe(el, "box-shadow"));
		}
		return offenders;
	});
	return [...(await elementsInMotion(page)), ...effects];
}

/** Transform and opacity of every element. Two equal samples mean nothing on the page is moving. */
function motionSample(page: Page): Promise<string> {
	return page.evaluate(() =>
		[...document.querySelectorAll("*")]
			.map((el) => {
				const style = getComputedStyle(el);
				return `${style.transform}|${style.opacity}`;
			})
			.join(";"),
	);
}

/**
 * The stylesheet cannot stop motion driven from JS, and the style sweep above
 * cannot see it, so this samples the page twice instead.
 */
async function isPageStill(page: Page): Promise<boolean> {
	const first = await motionSample(page);
	await page.waitForTimeout(400);
	const running = await page.evaluate(() => document.getAnimations().length);
	return running === 0 && first === (await motionSample(page));
}

test.describe("e-ink mode on a small reader", () => {
	test.use({ viewport: SMALL_READER });

	test("a restart never flashes the stored dark theme or drops the mode, and turning it off restores the theme", async ({
		page,
	}) => {
		await freshInstallAtLibrary(page);
		await page.goto("/tabs/settings/general");
		await page.getByRole("button", { name: "Dark" }).click();
		await expect(page.locator("html")).toHaveClass(/\bdark\b/);
		await page.locator("#eink-mode").click();
		await expect(page.locator("html")).toHaveClass(/\beink\b/);

		// Every value the root class takes during the next load, from before any script runs.
		await page.addInitScript(() => {
			const seen: string[] = [];
			(window as unknown as { __rootClasses: string[] }).__rootClasses = seen;
			// <html> may not exist yet at this point, so watch the document for it.
			new MutationObserver((records) => {
				if (records.some((record) => record.target === document.documentElement)) {
					seen.push(document.documentElement.className);
				}
			}).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
		});
		await page.reload();
		await expect(page.locator("#eink-mode")).toHaveAttribute("data-state", "checked");

		const seen = await page.evaluate(
			() => (window as unknown as { __rootClasses: string[] }).__rootClasses,
		);
		const firstWithMode = seen.findIndex((className) => /\beink\b/.test(className));
		// The boot script applies the cached mode before the app has loaded its settings.
		expect(firstWithMode).toBeGreaterThanOrEqual(0);
		expect(firstWithMode).toBeLessThanOrEqual(1);
		for (const className of seen) {
			expect(className).not.toMatch(/\bdark\b/);
		}
		for (const className of seen.slice(firstWithMode)) {
			expect(className).toMatch(/\beink\b/);
		}
		await expect(page.locator("html")).toHaveClass(/\beink\b/);

		await page.locator("#eink-mode").click();
		await expect(page.locator("html")).not.toHaveClass(/\beink\b/);
		await expect(page.locator("html")).toHaveClass(/\bdark\b/);
	});

	test("opens books in page mode and turns pages instantly, without following the finger", async ({
		page,
	}) => {
		await seedBigBook(page);
		await turnOnEinkMode(page);
		await page.goto("/tabs/library");
		await openBookFromLibrary(page, BIG_BOOK_TITLE);
		await expect(page.locator(".page-view")).toBeVisible();
		expect(await elementsWithEffects(page)).toEqual([]);

		await reader.openAppearance(page);
		const pagination = page.locator(".ap-section").filter({ hasText: "Pagination" });
		await expect(pagination.getByRole("radio", { name: "Page" })).toHaveAttribute(
			"data-state",
			"on",
		);
		await expect(pagination.getByRole("radio", { name: "Scroll" })).toBeDisabled();
		await expect(page.locator(".ap-row").filter({ hasText: "Page animation" })).toHaveCount(0);
		await page.keyboard.press("Escape");
		await expect(page.locator(".appearance-popover-content")).toHaveCount(0);

		const box = await page.locator(".page-view").boundingBox();
		if (!box) throw new Error("page view has no box");
		const y = box.y + box.height / 2;
		const fromX = box.x + box.width * 0.8;
		const pageTransform = () =>
			page.evaluate(() => {
				const el = document.querySelector<HTMLElement>(".page-view [style*='translateX']");
				return el ? getComputedStyle(el).transform : null;
			});
		const before = await pageTransform();
		const savesBefore = await reader.saveCount(page);

		const cdp = await page.context().newCDPSession(page);
		await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
		await cdp.send("Input.dispatchTouchEvent", {
			type: "touchStart",
			touchPoints: [{ x: fromX, y }],
		});
		for (let step = 1; step <= 5; step++) {
			await cdp.send("Input.dispatchTouchEvent", {
				type: "touchMove",
				touchPoints: [{ x: fromX - step * 20, y }],
			});
		}
		expect(await pageTransform()).toBe(before);
		await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
		await cdp.detach();

		await reader.waitForSaveAbove(page, savesBefore, 5_000);
		expect(await reader.lastSavedWord(page)).toBeGreaterThan(0);
		expect(await pageTransform()).not.toBe(before);
	});

	test("JS-driven motion stops too: the pulsing stats placeholder stands still", async ({
		page,
	}) => {
		await freshInstallAtLibrary(page);
		await page.goto("/tabs/stats");
		await expect(page.getByRole("heading", { name: "No stats yet" })).toBeVisible();
		// The control: without the mode this screen really does move, so the check can fail.
		expect(await isPageStill(page)).toBe(false);

		await turnOnEinkMode(page);
		await page.goto("/tabs/stats");
		await expect(page.getByRole("heading", { name: "No stats yet" })).toBeVisible();
		expect(await isPageStill(page)).toBe(true);
	});
});

test.describe("e-ink mode on a large reader", () => {
	test.use({ viewport: LARGE_READER_PORTRAIT });

	test("nothing moves, blurs or casts a shadow on the main screens", async ({ page }) => {
		await freshInstallAtLibrary(page);
		await turnOnEinkMode(page);
		expect(await elementsWithEffects(page)).toEqual([]);

		for (const path of ["/tabs/library", "/tabs/explore", "/tabs/settings"]) {
			await page.goto(path);
			await expect(page.locator("html")).toHaveClass(/\beink\b/);
			expect(await elementsWithEffects(page), path).toEqual([]);
		}
	});
});
