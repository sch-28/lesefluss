import { expect, type Page, test } from "@playwright/test";
import { importFixtureBook, openBook } from "./support/library";

test.beforeEach(async ({ page }) => {
	await page.route(/catalog\.lesefluss\.app/, (route) => route.abort());
});

function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
	});
	return errors;
}

test("the web app hides native-only features and keeps browser read aloud", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const errors = collectErrors(page);
	const title = await importFixtureBook(page);

	await expect(page.getByRole("button", { name: "Bluetooth device status" })).toHaveCount(0);

	await page.goto("/app/tabs/settings");
	await expect(page.getByText("Listen", { exact: true })).toBeVisible();
	for (const name of ["Device", "Website"]) {
		await expect(page.getByText(name, { exact: true })).toHaveCount(0);
	}

	await page.goto("/app/tabs/settings/device");
	await page.waitForURL(/\/app\/tabs\/settings$/);

	await page.goto("/app/tabs/settings/reader");
	await expect(page.getByText("Underline active word")).toBeVisible();
	await expect(page.getByText("Turn pages with volume buttons")).toHaveCount(0);

	await page.goto("/app/tabs/settings/read-aloud");
	await expect(page.getByText("From your browser and system")).toBeVisible();
	await expect(page.getByText("Download voices")).toHaveCount(0);
	await expect(page.getByText("System speech settings")).toHaveCount(0);

	await page.goto("/app/tabs/library");
	await openBook(page, title);
	await expect(page.getByRole("button", { name: "Listen", exact: true })).toBeVisible();

	await page.goto("/app/tabs/social");
	await expect(page.getByRole("button", { name: "Sign in to get started" })).toBeVisible();
	await page.goto("/app/tabs/library");
	await page.getByRole("button", { name: "Add book" }).click();
	await expect(page.getByText("Import folder")).toBeVisible();

	expect(errors).toEqual([]);
});

test("the app manifest is installable and the website links it", async ({ page, request }) => {
	const res = await request.get("/app/manifest.webmanifest");
	expect(res.ok()).toBe(true);
	const manifest = await res.json();
	expect(manifest).toMatchObject({
		id: "/app/",
		name: "Lesefluss",
		short_name: "Lesefluss",
		start_url: "/app/",
		scope: "/",
		display: "standalone",
	});
	for (const icon of manifest.icons as { src: string }[]) {
		const img = await request.get(icon.src);
		expect(img.headers()["content-type"]).toBe("image/png");
	}
	expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);

	await page.goto("/");
	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
		"href",
		"/app/manifest.webmanifest",
	);
});

test("See what's different scrolls the On the web card into view", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/app/tabs/library");
	await page.getByRole("button", { name: "See what's different" }).click();
	await page.waitForURL(/\/app\/tabs\/settings$/);
	await expect(page.getByRole("button", { name: "Get the Android app" })).toBeInViewport();
});
