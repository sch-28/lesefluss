import { expect, test } from "@playwright/test";

test("the bundled fonts' licenses read from Settings > About", async ({ page }) => {
	await page.goto("/tabs/settings");

	await page.getByText("Open source licenses").click();

	for (const font of ["Atkinson Hyperlegible", "OpenDyslexic", "Literata"]) {
		const notice = page.locator("details").filter({ hasText: font });
		await notice.locator("summary").click();
		await expect(notice).toContainText("SIL Open Font License");
	}
});
