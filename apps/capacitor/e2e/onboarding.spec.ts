import { expect, test } from "@playwright/test";
import { resetStorage } from "./helpers/seed";

test("fresh install redirects to onboarding; Skip lands at library", async ({ page }) => {
	await resetStorage(page);

	// RootRedirect at "/" sends users without `settings.onboardingCompleted`
	// straight to /onboarding.
	await page.goto("/");
	await page.waitForURL(/\/onboarding/, { timeout: 10_000 });

	await page.getByRole("button", { name: "Skip onboarding" }).click();
	await page.waitForURL(/\/tabs\/library/, { timeout: 10_000 });

	// Library renders its empty state for the brand-new install.
	await expect(page.getByText("No books yet")).toBeVisible({ timeout: 10_000 });
});
