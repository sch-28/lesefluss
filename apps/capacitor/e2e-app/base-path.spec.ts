import { expect, type Page, test } from "@playwright/test";
import { resetAppStorage } from "./support/app";
import { importFixtureBook } from "./support/library";

// The catalog is a separate service; nothing here should depend on the real one.
test.beforeEach(async ({ page }) => {
	await page.route(/catalog\.lesefluss\.app/, (route) => route.abort());
});

/** Every failed same-origin request and every console error while `run` executes. */
async function problemsDuring(page: Page, run: () => Promise<void>): Promise<string[]> {
	const problems: string[] = [];
	const origin = new URL(page.url()).origin;
	page.on("response", (res) => {
		if (res.url().startsWith(origin) && res.status() >= 400) {
			problems.push(`${res.status()} ${res.url()}`);
		}
	});
	page.on("requestfailed", (req) => {
		if (req.url().startsWith(origin)) problems.push(`failed ${req.url()}`);
	});
	page.on("console", (msg) => {
		if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
	});
	await run();
	return problems;
}

test("the /app bundle loads under /app/ with nothing missing", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await resetAppStorage(page);
	const problems = await problemsDuring(page, async () => {
		await page.goto("/app/");
		await page.waitForURL(/\/app\/onboarding/);
		await expect(page.getByRole("button", { name: "Get started" })).toBeVisible();
		await page.goto("/app/tabs/library");
		await expect(page.getByText("No books yet")).toBeVisible();
		await page.goto("/app/tabs/settings");
		await expect(page).toHaveURL(/\/app\/tabs\/settings/);
	});
	const scripts = await page
		.locator("script[src]")
		.evaluateAll((els) => els.map((el) => el.getAttribute("src")));
	expect(scripts.length).toBeGreaterThan(0);
	for (const src of scripts) expect(src).toMatch(/^\/app\/assets\//);
	expect(problems).toEqual([]);
});

// router.history.push skips the basepath: the URL lost /app and a reload hit the website's 404.
test("in-app navigation keeps the /app prefix", async ({ page }) => {
	const title = await importFixtureBook(page);
	await page.locator(`[data-book-title="${title}"]`).first().click({ button: "right" });
	await page.getByRole("button", { name: "Details" }).click();
	await expect(page).toHaveURL(/\/app\/tabs\/library\/book\//);
	await page.reload();
	await expect(page.getByRole("banner").getByRole("heading", { name: title })).toBeVisible();

	await page.keyboard.press("ControlOrMeta+k");
	await page.getByRole("option", { name: "Open settings" }).click();
	await expect(page).toHaveURL(/\/app\/tabs\/settings$/);
});
