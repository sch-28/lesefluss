import { expect, test } from "@playwright/test";
import { openBookFromLibrary, seedStrayAnchorBook } from "./helpers/seed";
import { reader } from "./page-objects/reader";

test("auto-opened last book: back leaves the reader for the library", async ({ page }) => {
	const title = await seedStrayAnchorBook(page);
	await page.goto("/");
	await page.waitForURL(/\/onboarding/, { timeout: 10_000 });
	await page.getByRole("button", { name: "Skip onboarding" }).click();
	await page.waitForURL(/\/tabs\/library/, { timeout: 10_000 });

	// lastRead is only stamped by a real position save.
	await openBookFromLibrary(page, title);
	const baseline = await reader.saveCount(page);
	await reader.moveToChapter(page, "2: Second");
	await reader.waitForSaveAbove(page, baseline, 10_000);
	await page.goBack();
	await page.waitForURL(/\/tabs\/library/);

	await page.goto("/tabs/settings/general");
	await page.locator("#auto-open-last-book").click();
	await expect(page.locator("#auto-open-last-book")).toHaveAttribute("data-state", "checked");

	await page.goto("/");
	await page.waitForURL(/\/tabs\/reader\//, { timeout: 10_000 });

	await page.getByRole("button", { name: "Back" }).first().click();
	await page.waitForURL(/\/tabs\/library/, { timeout: 10_000 });
	await page.waitForTimeout(1000);
	await expect(page).toHaveURL(/\/tabs\/library/);
});
