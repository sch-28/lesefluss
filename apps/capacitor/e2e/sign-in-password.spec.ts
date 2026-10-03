import { expect, test } from "@playwright/test";
import { MOCK_EMAIL, mockPasswordSignIn, mockSessionAndSync } from "./helpers/auth-mock";
import { resetStorage } from "./helpers/seed";

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
	await page.goto("/");
	await page.waitForURL(/\/onboarding/, { timeout: 10_000 });
	await page.getByRole("button", { name: "Skip onboarding" }).click();
	await page.waitForURL(/\/tabs\/library/, { timeout: 10_000 });
});

test("signs in with email and password from Settings > Sync", async ({ page }) => {
	await mockSessionAndSync(page);
	await mockPasswordSignIn(page);
	await page.goto("/tabs/settings/sync");

	await page.getByLabel("Email").fill(MOCK_EMAIL);
	await page.getByLabel("Password").fill("hunter22");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();

	await expect(page.getByText(`Signed in as ${MOCK_EMAIL}`)).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText("Sign out")).toBeVisible();
	await expect(page.getByLabel("Email")).toHaveCount(0);
});

test("shows the server's rejection inline and keeps the form", async ({ page }) => {
	await mockSessionAndSync(page);
	await mockPasswordSignIn(page, 401);
	await page.goto("/tabs/settings/sync");

	await page.getByLabel("Email").fill(MOCK_EMAIL);
	await page.getByLabel("Password").fill("wrong");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();

	await expect(page.getByText("Wrong email or password.")).toBeVisible();
	await expect(page.getByLabel("Password")).toBeVisible();
});
