import { expect, test } from "@playwright/test";
import { authFile, resetAppStorage, submitLogin } from "./support/app";

test("an invite link opened signed out leads through the web app to a friendship", async ({
	browser,
}) => {
	const ada = await browser.newContext({ storageState: authFile("ada") });
	const adaPage = await ada.newPage();
	await adaPage.goto("/app/tabs/social/invite-link");
	const link = await adaPage.getByLabel("Your invite link").inputValue();
	const path = new URL(link).pathname;
	expect(path).toMatch(/^\/invite\/[\w-]+$/);

	const bea = await browser.newContext();
	const beaPage = await bea.newPage();
	await resetAppStorage(beaPage);
	await beaPage.goto(path);
	await expect(beaPage.getByRole("heading", { name: "You've been invited" })).toBeVisible();
	await beaPage.getByRole("link", { name: "Continue in the web app" }).click();
	await beaPage.waitForURL(/\/app\/tabs\/social\/invite\//);
	await beaPage.getByRole("button", { name: "Sign in to get started" }).click();
	await beaPage.waitForURL(/\/login\?redirect=/);
	await submitLogin(beaPage, "bea");
	await beaPage.waitForURL(/\/app\/tabs\/social\/invite\//);
	await expect(beaPage.getByText("@ada_e2e")).toBeVisible();
	await beaPage.getByRole("button", { name: "Add friend" }).click();
	await expect(beaPage.getByRole("heading", { name: "You're now friends" })).toBeVisible();

	await beaPage.goto("/app/tabs/social");
	await expect(beaPage.getByText("@ada_e2e")).toBeVisible();
	await adaPage.goto("/app/tabs/social");
	await expect(adaPage.getByText("@bea_e2e")).toBeVisible();

	await ada.close();
	await bea.close();
});
