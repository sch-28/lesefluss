import { expect, test } from "@playwright/test";

test("reader settings preview follows text size changes", async ({ page }) => {
	await page.goto("/tabs/settings/reader");
	const paragraph = page.getByTestId("reader-preview").locator(".reader-paragraph");
	await expect(paragraph).toBeVisible();

	const fontSizeOf = () =>
		paragraph.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
	const before = await fontSizeOf();

	await page.getByRole("button", { name: "Increase Text size" }).click();
	await expect.poll(fontSizeOf).toBeGreaterThan(before);
});
