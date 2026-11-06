import { expect, test } from "@playwright/test";
import {
	MOCK_EMAIL,
	mockDeviceSignIn,
	mockPasswordSignIn,
	mockSessionAndSync,
} from "./helpers/auth-mock";
import { resetStorage } from "./helpers/seed";

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
	await page.goto("/");
	await page.waitForURL(/\/onboarding/, { timeout: 10_000 });
	await page.getByRole("button", { name: "Skip onboarding" }).click();
	await page.waitForURL(/\/tabs\/library/, { timeout: 10_000 });
	await mockSessionAndSync(page);
});

test("signs in with email and password from Settings > Sync", async ({ page }) => {
	await mockPasswordSignIn(page);
	await page.goto("/tabs/settings/sync");
	await page.getByRole("button", { name: "Sign in with email and password" }).click();

	await page.getByLabel("Email").fill(MOCK_EMAIL);
	await page.getByLabel("Password").fill("hunter22");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();

	await expect(page.getByText(`Signed in as ${MOCK_EMAIL}`)).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText("Sign out")).toBeVisible();
	await expect(page.getByLabel("Email")).toHaveCount(0);
});

test("signs in with the phone: a code and QR, then signed in once the server approves", async ({
	page,
}) => {
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
