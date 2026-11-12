import { expect, test } from "@playwright/test";
import { resetAppStorage, submitLogin } from "./support/app";

// The catalog is a separate service; onboarding's book picker must not reach the real one.
test.beforeEach(async ({ page }) => {
	await page.route(/catalog\.lesefluss\.app/, (route) => route.abort());
});

test("signing in from onboarding returns to the /app library, not the website profile", async ({
	page,
}) => {
	await resetAppStorage(page);
	await page.goto("/app/");
	await page.waitForURL(/\/app\/onboarding/);
	await page.getByRole("button", { name: "Get started" }).click();
	const syncStep = page.getByRole("heading", { name: "Sync across devices?" });
	for (let i = 0; i < 8 && !(await syncStep.isVisible()); i++) {
		// The reading speed step has no Continue until its test is done.
		await page.getByRole("button", { name: /^(Continue|Skip this step)$/ }).click();
	}
	await expect(syncStep).toBeVisible();

	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await page.waitForURL(/\/login\?redirect=/);
	await submitLogin(page, "fay");
	await page.waitForURL(/\/app\/tabs\/library$/);

	// Signed in inside the app, and onboarding is not offered again.
	await page.goto("/app/tabs/social");
	await expect(page.getByRole("button", { name: "Pick your handle" })).toBeVisible();
	await page.goto("/app/");
	await page.waitForURL(/\/app\/tabs\/library/);
});

test("signing in from sync settings returns to sync settings", async ({ page }) => {
	await resetAppStorage(page);
	await page.goto("/app/tabs/settings/sync");
	await page.getByRole("link", { name: "Sign in", exact: true }).click();
	await page.waitForURL(/\/login\?redirect=%2Fapp%2Ftabs%2Fsettings%2Fsync/);
	await submitLogin(page, "fay");
	await page.waitForURL(/\/app\/tabs\/settings\/sync$/);
});
