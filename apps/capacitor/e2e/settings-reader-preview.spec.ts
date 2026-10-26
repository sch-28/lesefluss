import { expect, test } from "@playwright/test";

test("reader settings preview follows text size changes", async ({ page }) => {
	await page.goto("/tabs/settings/reader");
	const paragraph = page.getByTestId("reader-preview").locator(".reader-paragraph").first();
	await expect(paragraph).toBeVisible();

	const fontSizeOf = () =>
		paragraph.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
	const before = await fontSizeOf();

	await page.getByRole("button", { name: "Increase Text size" }).click();
	await expect.poll(fontSizeOf).toBeGreaterThan(before);
});

test("reader settings preview follows spacing changes", async ({ page }) => {
	await page.goto("/tabs/settings/reader");
	const paragraph = page.getByTestId("reader-preview").locator(".reader-paragraph").first();
	await expect(paragraph).toBeVisible();
	const spacingOf = () =>
		paragraph.evaluate((el) => {
			const style = getComputedStyle(el);
			return `${style.letterSpacing}|${style.wordSpacing}|${style.marginBottom}`;
		});
	const before = await spacingOf();

	for (const label of ["Letter spacing", "Word spacing", "Paragraph spacing"]) {
		const previous = await spacingOf();
		await page.getByRole("button", { name: `Increase ${label}` }).click();
		await expect.poll(spacingOf, `${label} reached the preview`).not.toBe(previous);
	}
	expect(await spacingOf()).not.toBe(before);
});
