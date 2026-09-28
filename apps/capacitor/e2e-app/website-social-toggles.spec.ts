import { expect, test } from "@playwright/test";
import { authFile } from "./support/app";

test.use({ storageState: authFile("eve") });

test("the account page's activity toggles persist, and stopping feed sharing asks first", async ({
	page,
}) => {
	await page.goto("/account");
	const live = page.getByRole("switch", { name: "Share live reading activity in buddy reads" });
	const feed = page.getByRole("switch", { name: "Share my reading activity in friends' feeds" });
	await expect(live).toBeChecked();
	await expect(feed).toBeChecked();

	await live.click();
	await expect(live).not.toBeChecked();
	await page.reload();
	await expect(live).not.toBeChecked();

	await feed.click();
	const dialog = page.getByRole("alertdialog", { name: "Stop sharing your reading activity?" });
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(dialog).toHaveCount(0);
	await expect(feed).toBeChecked();
	await page.reload();
	await expect(feed).toBeChecked();

	await feed.click();
	await dialog.getByRole("button", { name: "Stop sharing" }).click();
	await expect(feed).not.toBeChecked();
	await page.reload();
	await expect(feed).not.toBeChecked();
	await expect(live).not.toBeChecked();
});
