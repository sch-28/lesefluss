import { expect, type Page, test } from "@playwright/test";
import { mockDeviceSignIn, mockSessionAndSync } from "./helpers/auth-mock";
import { BIG_BOOK_TITLE, seedBigBook } from "./helpers/big-book";
import { openBookFromLibrary, resetStorage } from "./helpers/seed";
import { reader } from "./page-objects/reader";

/** A 6-inch budget reader, and the Boox Nova Air 2 in both orientations. */
const SMALL_READER = { width: 480, height: 640 };
const LARGE_READER_PORTRAIT = { width: 749, height: 998 };
const LARGE_READER_LANDSCAPE = { width: 998, height: 749 };

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
function elementsWithEffects(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const offenders: string[] = [];
		const describe = (el: Element, what: string) =>
			`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)}: ${what}`;
		for (const el of document.querySelectorAll("*")) {
			const style = getComputedStyle(el);
			if (style.transitionDuration.split(",").some((d) => Number.parseFloat(d) > 0)) {
				offenders.push(describe(el, `transition ${style.transitionDuration}`));
			}
			if (style.animationName !== "none") offenders.push(describe(el, "animation"));
			if (style.backdropFilter !== "none") offenders.push(describe(el, "backdrop-filter"));
			if (style.boxShadow !== "none") offenders.push(describe(el, "box-shadow"));
		}
		const running = document.getAnimations().length;
		if (running > 0) offenders.push(`${running} running animation(s)`);
		return offenders;
	});
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

/** Whether the phone sign-in comes before the email field, top to bottom. */
async function isPhoneSignInFirst(page: Page): Promise<boolean> {
	await expect(page.getByRole("button", { name: "Sign in with your phone" })).toBeVisible();
	await expect(page.getByLabel("Email")).toBeVisible();
	return page.evaluate(() => {
		const phone = [...document.querySelectorAll("button")].find(
			(b) => b.textContent?.trim() === "Sign in with your phone",
		);
		const email = document.querySelector("input[type='email']");
		return Boolean(
			phone && email && phone.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING,
		);
	});
}

test.describe("e-ink mode on a small reader", () => {
	test.use({ viewport: SMALL_READER });

	test("the toggle sets the root class, survives a restart and comes off again", async ({
		page,
	}) => {
		await freshInstallAtLibrary(page);
		await turnOnEinkMode(page);
		await expect(page.locator("html")).toHaveClass(/\blight\b/);

		await page.goto("/tabs/library");
		await expect(page.locator("html")).toHaveClass(/\beink\b/);
		expect(await page.evaluate(() => localStorage.getItem("app-eink"))).toBe("1");

		await page.goto("/tabs/settings/general");
		await expect(page.locator("#eink-mode")).toHaveAttribute("data-state", "checked");
		await page.locator("#eink-mode").click();
		await expect(page.locator("html")).not.toHaveClass(/\beink\b/);
	});

	test("a restart never flashes the stored dark theme or drops the mode", async ({ page }) => {
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
	});

	test("the stored theme is kept and its cards explain the override", async ({ page }) => {
		await freshInstallAtLibrary(page);
		await page.goto("/tabs/settings/general");
		await page.getByRole("button", { name: "Sepia" }).click();
		await expect(page.locator("html")).toHaveClass(/\bsepia\b/);

		await page.locator("#eink-mode").click();
		await expect(page.locator("html")).toHaveClass(/\blight\b/);
		await expect(page.getByRole("button", { name: "Sepia" })).toBeDisabled();
		await expect(page.getByRole("button", { name: "Sepia" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(page.getByText("E-ink display is on and uses its own")).toBeVisible();

		await page.locator("#eink-mode").click();
		await expect(page.locator("html")).toHaveClass(/\bsepia\b/);
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

		await page.getByRole("button", { name: "Appearance settings" }).click();
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
		await page.goto("/tabs/library/stats");
		await expect(page.getByRole("heading", { name: "No stats yet" })).toBeVisible();
		// The control: without the mode this screen really does move, so the check can fail.
		expect(await isPageStill(page)).toBe(false);

		await turnOnEinkMode(page);
		await page.goto("/tabs/library/stats");
		await expect(page.getByRole("heading", { name: "No stats yet" })).toBeVisible();
		expect(await isPageStill(page)).toBe(true);
	});

	test("sign-in leads with the phone and its dialog is static", async ({ page }) => {
		await freshInstallAtLibrary(page);
		await mockSessionAndSync(page);
		await mockDeviceSignIn(page, { pendingPolls: 100 });
		await turnOnEinkMode(page);
		await page.goto("/tabs/settings/sync");

		await expect(page.locator("html")).toHaveClass(/\beink\b/);
		await expect.poll(() => isPhoneSignInFirst(page)).toBe(true);

		await page.getByRole("button", { name: "Sign in with your phone" }).click();
		const dialog = page.getByRole("dialog");
		await expect(dialog.getByTestId("device-link-qr")).toBeVisible();
		expect(await elementsWithEffects(page)).toEqual([]);
		const overlay = await page
			.locator("[data-slot='dialog-overlay']")
			.evaluate((el) => getComputedStyle(el).backgroundColor);
		expect(overlay).toBe("rgba(0, 0, 0, 0)");
	});

	test("the onboarding theme step offers the mode to devices no list knows", async ({ page }) => {
		await resetStorage(page);
		await page.goto("/");
		await page.waitForURL(/\/onboarding/, { timeout: 10_000 });
		await page.getByRole("button", { name: "Get started" }).click();
		await expect(page.getByRole("heading", { name: "Pick a theme" })).toBeVisible();
		await page.locator("#onboarding-eink-mode").click();
		await expect(page.locator("html")).toHaveClass(/\beink\b/);

		await page.getByRole("button", { name: "Skip onboarding" }).click();
		await page.waitForURL(/\/tabs\/library/, { timeout: 10_000 });
		await expect(page.locator("html")).toHaveClass(/\beink\b/);
	});

	test("without the mode, sign-in keeps the email form first", async ({ page }) => {
		await freshInstallAtLibrary(page);
		await page.goto("/tabs/settings/sync");
		await expect(page.locator("html")).not.toHaveClass(/\beink\b/);
		expect(await isPhoneSignInFirst(page)).toBe(false);
	});
});

for (const [name, viewport] of [
	["portrait with the tab bar", LARGE_READER_PORTRAIT],
	["landscape with the sidebar", LARGE_READER_LANDSCAPE],
] as const) {
	test.describe(`e-ink mode on a large reader, ${name}`, () => {
		test.use({ viewport });

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
}
