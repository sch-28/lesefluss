import { expect, type Page, test } from "@playwright/test";
import { MOCK_EMAIL, mockPasswordSignIn, mockSessionAndSync } from "./helpers/auth-mock";
import { PLAIN_BOOK_TITLE, plainBookFixture } from "./helpers/plain-book";
import { seedFixture } from "./helpers/seed";

const MIB = 1024 * 1024;
const QUOTA = { usedBytes: 499 * MIB, quotaBytes: 500 * MIB };

/**
 * A full account: the pull reports the quota, and every push carrying book
 * content gets the 413 that keeps everything but that content. Installed after
 * `mockSessionAndSync`, so these routes win for /api/sync.
 */
async function mockFullCloudStorage(page: Page): Promise<{ pushes: () => number }> {
	let pushes = 0;
	await page.route(/\/api\/sync(\?|$)/, async (route) => {
		if (route.request().method() !== "POST") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					books: [],
					series: [],
					highlights: [],
					glossaryEntries: [],
					readingSessions: [],
					contentBookIds: [],
					contentQuota: QUOTA,
				}),
			});
			return;
		}
		pushes += 1;
		const body = route.request().postDataJSON() as {
			books: { bookId: string; content?: string | null }[];
		};
		const refused = body.books.filter((b) => b.content != null).map((b) => b.bookId);
		if (refused.length === 0) {
			await route.fulfill({ status: 204 });
			return;
		}
		await route.fulfill({
			status: 413,
			contentType: "application/json",
			body: JSON.stringify({
				error: "Storage quota exceeded",
				code: "content_quota_exceeded",
				rejectedContentBookIds: refused,
				rejectedContentBytes: Object.fromEntries(refused.map((id) => [id, 5 * MIB])),
				...QUOTA,
			}),
		});
	});
	return { pushes: () => pushes };
}

async function signIn(page: Page) {
	await page.goto("/tabs/settings/sync");
	await page.getByRole("button", { name: "Sign in with email and password" }).click();
	await page.getByLabel("Email").fill(MOCK_EMAIL);
	await page.getByLabel("Password").fill("hunter22");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("a book refused for lack of cloud storage is named, listed and marked", async ({ page }) => {
	await seedFixture(page, plainBookFixture(), "plain.epub");
	await mockSessionAndSync(page);
	await mockPasswordSignIn(page);
	const server = await mockFullCloudStorage(page);

	await signIn(page);
	await expect(
		page.getByText(`Not enough cloud storage. Not backed up: "${PLAIN_BOOK_TITLE}".`),
	).toBeVisible({ timeout: 10_000 });

	// Settings: usage and the refused book.
	await expect(page.getByText("499.0 MB of 500.0 MB used")).toBeVisible();
	await expect(page.getByText("Not backed up (1)")).toBeVisible();

	// Already blocked: a manual sync omits the content but still says what is not backed up.
	const before = server.pushes();
	await page.getByRole("button", { name: "Sync now" }).click();
	await expect(
		page.getByText("Synced. 1 book isn't backed up: not enough cloud storage."),
	).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText("Synced", { exact: true })).toHaveCount(0);
	expect(server.pushes()).toBeGreaterThan(before);

	await page.getByRole("link", { name: PLAIN_BOOK_TITLE }).click();
	await page.waitForURL(/\/tabs\/library\/book\//);
	await expect(
		page.getByText(
			"Not backed up: not enough cloud storage, so this book stays on this device only.",
		),
	).toBeVisible();
});
