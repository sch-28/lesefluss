import { expect, test } from "@playwright/test";
import { apiAs, authFile, getJson, LIVE_BOOK, postJson } from "./support/app";

type Summary = { id: string; myBookId: string };

test("a member adopts the buddy read's deadline as their own goal", async ({ browser }) => {
	const cy = await apiAs("cy");
	const dee = await apiAs("dee");
	const [read] = await getJson<Summary[]>(cy, "/api/social/buddy-reads");
	const [mine] = await getJson<Summary[]>(dee, "/api/social/buddy-reads");
	if (!read || !mine) throw new Error("setup left no buddy read");
	const due = new Date();
	due.setDate(due.getDate() + 30);
	due.setHours(23, 59, 59, 0);
	await postJson(cy, "/api/social/buddy-read-target-date", {
		buddyReadId: read.id,
		targetDate: due.getTime(),
	});

	const context = await browser.newContext({ storageState: authFile("dee") });
	try {
		const page = await context.newPage();
		await page.goto("/app/tabs/library");
		await expect(page.locator(`[data-book-title="${LIVE_BOOK.title}"]`)).toHaveCount(1, {
			timeout: 20_000,
		});

		await page.goto(`/app/tabs/social/buddy-read/${read.id}`);
		const deadline = page.locator("section", { hasText: "Deadline" });
		await expect(deadline).toBeVisible({ timeout: 15_000 });
		// Members see the date; only the host gets the date input.
		await expect(deadline.locator('input[type="date"]')).toHaveCount(0);
		await deadline.getByRole("button", { name: "Adopt" }).click();
		await expect(deadline.getByText("my goal")).toBeVisible();

		await page.goto(`/app/tabs/library/book/${mine.myBookId}`);
		const card = page.getByTestId("goal-card");
		await expect(card).toBeVisible({ timeout: 15_000 });
		await expect(card).toContainText("Missed day: raise daily target");
	} finally {
		await postJson(cy, "/api/social/buddy-read-target-date", {
			buddyReadId: read.id,
			targetDate: null,
		});
		await context.close();
		await cy.dispose();
		await dee.dispose();
	}
});
