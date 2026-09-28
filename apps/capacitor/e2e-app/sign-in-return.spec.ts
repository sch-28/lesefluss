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
		await page.getByRole("button", { name: "Continue", exact: true }).click();
	}
	await expect(syncStep).toBeVisible();

	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await page.waitForURL(/\/login\?redirect=/);
	await submitLogin(page, "fay");
	await page.waitForURL(/\/app\/tabs\/library$/);

	// Signed in inside the app, and onboarding is not offered again.
	await page.goto("/app/tabs/social");
	await expect(page.getByRole("heading", { name: "Pick a handle" })).toBeVisible();
	await page.goto("/app/");
	await page.waitForURL(/\/app\/tabs\/library/);
});

test("the signed-out social tab signs in and comes back to the social tab", async ({ page }) => {
	await resetAppStorage(page);
	await page.goto("/app/tabs/social");
	await page.getByRole("button", { name: "Sign in to get started" }).click();
	await page.waitForURL(/\/login\?redirect=/);
	await submitLogin(page, "fay");
	await page.waitForURL(/\/app\/tabs\/social$/);
	await expect(page.getByRole("heading", { name: "Pick a handle" })).toBeVisible();
});
