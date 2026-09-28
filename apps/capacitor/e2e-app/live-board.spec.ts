import { LIVE_IDLE_MS } from "@lesefluss/core";
import { type Browser, expect, test } from "@playwright/test";
import { authFile, LIVE_BOOK, type UserKey } from "./support/app";
import { openBook } from "./support/library";

async function openLiveBook(browser: Browser, user: UserKey) {
	const context = await browser.newContext({ storageState: authFile(user) });
	const page = await context.newPage();
	await page.goto("/app/tabs/library");
	// The book arrives through the sync pull that follows sign-in.
	await expect(page.locator(`[data-book-title="${LIVE_BOOK.title}"]`)).toHaveCount(1, {
		timeout: 20_000,
	});
	await openBook(page, LIVE_BOOK.title);
	return { context, page };
}

test("buddy-read members see each other reading, and closing the tab drops off the board at once", async ({
	browser,
}) => {
	const cy = await openLiveBook(browser, "cy");
	const dee = await openLiveBook(browser, "dee");
	const live = (page: typeof cy.page) => page.locator(".reader-buddy-dot--live");

	await expect(live(cy.page)).toHaveCount(1, { timeout: 15_000 });
	await expect(live(dee.page)).toHaveCount(1, { timeout: 15_000 });

	// A closing tab never runs React cleanups; only the pagehide stop takes cy off.
	await cy.page.close({ runBeforeUnload: true });
	const deadline = 10_000;
	expect(deadline).toBeLessThan(LIVE_IDLE_MS);
	await expect(live(dee.page)).toHaveCount(0, { timeout: deadline });
	// cy is still a member, just no longer reading now.
	await expect(dee.page.locator(".reader-buddy-dot")).toHaveCount(1);

	await cy.context.close();
	await dee.context.close();
});
