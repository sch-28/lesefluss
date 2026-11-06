import { expect, type Page, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";

/**
 * Two-finger tap toggles the reading-session pause: overlay appears, the
 * tracker checkpoints and stops accruing, a single tap (after the resume grace
 * period) or another two-finger tap resumes. Desktop chromium has no touch
 * input, but Blink exposes the
 * Touch/TouchEvent constructors unconditionally, so the gesture is driven by
 * dispatching constructed touch events on the view container — the same
 * events the native listeners consume on device.
 */

async function twoFingerTap(page: Page) {
	await page.getByTestId("reader-view").waitFor();
	await page.evaluate(() => {
		const el = document.querySelector('[data-testid="reader-view"]');
		if (!el) throw new Error("reader-view container not found");
		const rect = el.getBoundingClientRect();
		const mkTouch = (identifier: number, dx: number) =>
			new Touch({
				identifier,
				target: el,
				clientX: rect.left + rect.width / 2 + dx,
				clientY: rect.top + rect.height / 2,
			});
		const fire = (type: string, touches: Touch[], changedTouches: Touch[]) =>
			el.dispatchEvent(
				new TouchEvent(type, {
					touches,
					changedTouches,
					targetTouches: touches,
					bubbles: true,
					cancelable: true,
				}),
			);
		const t1 = mkTouch(1, -30);
		const t2 = mkTouch(2, 30);
		fire("touchstart", [t1], [t1]);
		fire("touchstart", [t1, t2], [t2]);
		fire("touchend", [t2], [t1]);
		fire("touchend", [], [t2]);
	});
}

const overlay = (page: Page) => page.getByTestId("session-pause-overlay");
const sessionCount = (page: Page) =>
	page.evaluate(() => window.__lesefluss_e2e_session?.count ?? 0);

test("two-finger tap pauses the session, tap resumes, flush still works", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await openBookFromLibrary(page, title);

	// Accumulate past the noise floor (MIN_DURATION_MS=5s, MIN_WORDS=5) so the
	// pause checkpoint has a row to write.
	for (let i = 0; i < 7; i++) {
		await page.mouse.wheel(0, 120);
		await page.waitForTimeout(900);
	}
	const baseline = await sessionCount(page);

	await twoFingerTap(page);
	await expect(overlay(page)).toBeVisible();

	// Going inactive checkpoints the sitting.
	await expect.poll(() => sessionCount(page), { timeout: 5000 }).toBeGreaterThan(baseline);
	expect(await page.evaluate(() => window.__lesefluss_e2e_session?.lastKind ?? null)).toBe(
		"checkpoint",
	);

	// While paused nothing persists — no heartbeat, and scrolling under the
	// overlay (momentum, accidental input) accrues nothing.
	const pausedCount = await sessionCount(page);
	await page.waitForTimeout(2000);
	await page.mouse.wheel(0, 120);
	await page.waitForTimeout(500);
	expect(await sessionCount(page)).toBe(pausedCount);

	// Resume after the grace period; overlay goes away.
	await overlay(page).click();
	await expect(overlay(page)).toBeHidden();

	// The sitting continues and still flushes on close.
	await page.mouse.wheel(0, 120);
	await page.waitForTimeout(900);
	await page.getByRole("button", { name: "Back" }).first().click();
	await page.waitForURL(/\/tabs\/library/, { timeout: 5000 });
	await expect
		.poll(async () => page.evaluate(() => window.__lesefluss_e2e_session?.lastKind ?? null), {
			timeout: 10_000,
		})
		.toBe("flush");
});
