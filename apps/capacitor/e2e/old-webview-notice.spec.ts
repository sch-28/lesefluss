import { expect, type Page, test } from "@playwright/test";
import { MIN_CHROMIUM } from "../../../packages/core/src/engine-support";
import { resetStorage } from "./helpers/seed";

const notice = "#engine-notice";

/** Telemetry posts, which only a build with a sync URL sends. */
function recordTelemetry(page: Page) {
	const posts: unknown[] = [];
	page.on("request", (req) => {
		if (req.url().endsWith("/api/telemetry") && req.method() === "POST") {
			posts.push(req.postDataJSON());
		}
	});
	return posts;
}

const buildSendsTelemetry = (page: Page) =>
	page.evaluate(() =>
		[...document.head.querySelectorAll("script:not([src])")].some((s) =>
			s.textContent?.includes("/api/telemetry"),
		),
	);

test("an engine without oklch() gets the WebView notice instead of a broken app", async ({
	page,
}) => {
	// What a pre-111 Chromium answers; the rest of the engine stays modern.
	await page.addInitScript(() => {
		const supports = CSS.supports.bind(CSS);
		CSS.supports = ((...args: [string, string?]) =>
			args[1]?.startsWith("oklch") ? false : supports(...args)) as typeof CSS.supports;
	});
	await page.route("**/api/telemetry", (route) => route.fulfill({ status: 200, body: "{}" }));
	const posts = recordTelemetry(page);
	await page.goto("/");

	await expect(page.locator(notice)).toBeVisible();
	await expect(page.locator(notice)).toContainText(`WebView ${MIN_CHROMIUM} or newer`);
	await expect(page.locator(`${notice} [data-platform="web"]`)).toBeHidden();
	const chromium = (await page.evaluate(() => navigator.userAgent)).match(/Chrome\/(\d+)/)?.[1];
	await expect(page.locator("[data-engine-version]")).toHaveText(chromium ?? "unknown");

	// The app never starts: no web database, nothing rendered.
	await page.waitForTimeout(1500);
	await expect(page.locator("jeep-sqlite")).toHaveCount(0);
	await expect(page.locator("#root")).toBeEmpty();
	if (await buildSendsTelemetry(page)) {
		expect(posts).toEqual([
			expect.objectContaining({ type: "webview_unsupported", webview: chromium }),
		]);
	}
});

test("a supported engine never sees the notice and reports nothing", async ({ page }) => {
	const posts = recordTelemetry(page);
	await resetStorage(page);
	await page.goto("/");
	await page.waitForURL(/\/onboarding/, { timeout: 10_000 });
	await expect(page.locator(notice)).toBeHidden();
	await expect(page.locator("html")).not.toHaveClass(/engine-unsupported/);
	expect(posts.filter((p) => (p as { type?: string }).type === "webview_unsupported")).toEqual([]);
});
