import { expect, test } from "@playwright/test";
import { MOCK_EMAIL, mockDeviceSignIn, mockSessionAndSync } from "./helpers/auth-mock";
import { resetStorage } from "./helpers/seed";

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
	await page.goto("/");
	await page.waitForURL(/\/onboarding/, { timeout: 10_000 });
	await page.getByRole("button", { name: "Skip onboarding" }).click();
	await page.waitForURL(/\/tabs\/library/, { timeout: 10_000 });
	await mockSessionAndSync(page);
});

test("shows a code and QR, then signs in once the server reports approval", async ({ page }) => {
	await mockDeviceSignIn(page, { pendingPolls: 2 });
	await page.goto("/tabs/settings/sync");
	await page.getByRole("button", { name: "Sign in with your phone" }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("ABCD-2345")).toBeVisible();
	await expect(dialog.getByTestId("device-link-qr")).toBeVisible();
	await expect(dialog.getByText("Waiting for confirmation…")).toBeVisible();

	await expect(page.getByText(`Signed in as ${MOCK_EMAIL}`)).toBeVisible({ timeout: 15_000 });
	await expect(dialog).toHaveCount(0);
	await expect(page.getByText("Sign out")).toBeVisible();
});

test("an expired code says so and offers a new one", async ({ page }) => {
	await mockDeviceSignIn(page, { pendingPolls: 0, outcome: "expired_token" });
	await page.goto("/tabs/settings/sync");
	await page.getByRole("button", { name: "Sign in with your phone" }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("This code has expired. Get a new one to try again.")).toBeVisible({
		timeout: 10_000,
	});
	await expect(dialog.getByRole("button", { name: "New code" })).toBeVisible();
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Sign in with your phone" })).toBeVisible();
});
