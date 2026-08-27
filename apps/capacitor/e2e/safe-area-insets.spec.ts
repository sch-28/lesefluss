import { expect, type Page, test } from "@playwright/test";
import { resetStorage } from "./helpers/seed";

/**
 * Reproduces the Samsung A27 5G report: under forced edge-to-edge that WebView
 * returned 0 for every `env(safe-area-inset-*)`, so the header sat under the
 * status bar and the tab bar under the navigation bar.
 *
 * Desktop Chromium also reports `env(safe-area-inset-*)` as 0, which makes it a
 * faithful stand-in. Capacitor's SystemBars plugin separately injects
 * `--safe-area-inset-*` as inline custom properties on documentElement
 * (`injectSafeAreaCSS`); setting them here is the same write the plugin makes.
 */
const INJECTED_TOP = 44;
const INJECTED_BOTTOM = 48;

test.use({ viewport: { width: 390, height: 844 } });

async function gotoLibrary(page: Page) {
	await resetStorage(page);
	await page.goto("/");
	await page.waitForURL(/\/onboarding/, { timeout: 10_000 });
	await page.getByRole("button", { name: "Skip onboarding" }).click();
	await page.waitForURL(/\/tabs\/library/, { timeout: 10_000 });
}

function injectInsets(page: Page, insets: { top?: number; bottom?: number }) {
	return page.evaluate(({ top, bottom }) => {
		const root = document.documentElement.style;
		if (top !== undefined) root.setProperty("--safe-area-inset-top", `${top}px`);
		if (bottom !== undefined) root.setProperty("--safe-area-inset-bottom", `${bottom}px`);
	}, insets);
}

const paddingTop = (page: Page) =>
	page
		.locator("header")
		.first()
		.evaluate((el) => getComputedStyle(el).paddingTop);

const tabBarPaddingBottom = (page: Page) =>
	page
		.locator("nav > div")
		.first()
		.evaluate((el) => getComputedStyle(el).paddingBottom);

test("injected Capacitor insets drive the shell when env() reports zero", async ({ page }) => {
	await gotoLibrary(page);
	await expect(page.locator("header").first()).toBeVisible();

	// Neither source has a value yet, so the shell sits flush.
	expect(await paddingTop(page)).toBe("0px");
	expect(await tabBarPaddingBottom(page)).toBe("0px");

	await injectInsets(page, { top: INJECTED_TOP, bottom: INJECTED_BOTTOM });

	// Reading env() alone would leave both at 0px on such a device.
	expect(await paddingTop(page)).toBe(`${INJECTED_TOP}px`);
	expect(await tabBarPaddingBottom(page)).toBe(`${INJECTED_BOTTOM}px`);
});

test("the scroll container clears the tab bar plus the injected bottom inset", async ({ page }) => {
	await gotoLibrary(page);
	const scroller = page.locator('[data-scroll-restoration-id="app-scroll"]');
	const paddingBottom = () =>
		scroller.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingBottom));

	const before = await paddingBottom();
	await injectInsets(page, { bottom: INJECTED_BOTTOM });

	expect((await paddingBottom()) - before).toBeCloseTo(INJECTED_BOTTOM, 1);
});

test("the shell follows re-injected insets, as on rotation or keyboard show", async ({ page }) => {
	await gotoLibrary(page);
	await injectInsets(page, { top: INJECTED_TOP });
	expect(await paddingTop(page)).toBe(`${INJECTED_TOP}px`);

	// Capacitor re-injects on every WindowInsets change, not just at startup.
	await injectInsets(page, { top: 0 });
	expect(await paddingTop(page)).toBe("0px");
});
