import {
	buildEpubBuffer,
	strayAnchorFixture,
} from "@lesefluss/book-import/test-fixtures/build-epub";
import { expect, type Page, type Route, test } from "@playwright/test";
import { MOCK_EMAIL, MOCK_SESSION_TOKEN, mockPasswordSignIn } from "./helpers/auth-mock";
import { resetStorage } from "./helpers/seed";

const CATALOG_HOST = "https://catalog.lesefluss.app";
const CATALOG_ID = "gutenberg:77001";
const TITLE = "Wishlist Test Book";
const DETAIL_PATH = `/tabs/explore/book/${encodeURIComponent(CATALOG_ID)}`;

const json = (route: Route, body: unknown, status = 200) =>
	route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** The landing, the detail and the EPUB of one catalog book; web-novel providers are down. */
async function mockCatalog(page: Page) {
	const epub = await buildEpubBuffer({ ...strayAnchorFixture(), title: TITLE });
	await page.route(`${CATALOG_HOST}/**`, (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === "/languages")
			return json(route, { total: 1, languages: [{ code: "en", count: 1 }] });
		if (path === "/genres") return json(route, { lang: "en", genres: [] });
		if (path === "/landing") {
			return json(route, { lang: "en", featured_se: [], classics: [], most_read: [], genres: [] });
		}
		if (path.startsWith("/shelves/random")) return json(route, { results: [] });
		if (path.startsWith("/books/similar/")) return json(route, { results: [] });
		if (path === `/books/epub/${encodeURIComponent(CATALOG_ID)}`) {
			return route.fulfill({ status: 200, contentType: "application/epub+zip", body: epub });
		}
		if (path.startsWith("/books/")) {
			return json(route, {
				id: CATALOG_ID,
				source: "gutenberg",
				title: TITLE,
				author: "Mock Author",
				language: "en",
				subjects: [],
				summary: null,
				description: null,
				epubUrl: `${CATALOG_HOST}/books/epub/${encodeURIComponent(CATALOG_ID)}`,
				coverUrl: null,
			});
		}
		if (path === "/proxy/article") return json(route, { error: "down" }, 502);
		return route.fulfill({ status: 404, body: "" });
	});
}

async function addFromDetail(page: Page) {
	await page.goto(DETAIL_PATH);
	await expect(page.locator("section").getByRole("heading", { name: TITLE })).toBeVisible({
		timeout: 10_000,
	});
	await page.getByRole("button", { name: "Add to wishlist" }).click();
	await expect(page.getByRole("button", { name: "Remove from wishlist" })).toBeVisible();
}

const shelf = (page: Page) => page.getByTestId("wishlist-shelf");
const card = (page: Page) => page.getByTestId("wishlist-card").filter({ hasText: TITLE });

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
});

test("signed out: a title saved from its page shows on the Explore shelf and See all, and stays after a reload", async ({
	page,
}) => {
	await mockCatalog(page);
	await addFromDetail(page);

	await page.goto("/tabs/explore");
	await expect(shelf(page)).toBeVisible({ timeout: 10_000 });
	await expect(card(page)).toBeVisible();

	await page.reload();
	await expect(card(page)).toBeVisible({ timeout: 10_000 });

	await shelf(page)
		.getByRole("button", { name: /See all/ })
		.click();
	await page.waitForURL(/\/tabs\/explore\/wishlist/);
	await expect(card(page)).toBeVisible();

	await card(page).getByRole("button", { name: TITLE, exact: false }).first().click();
	await page.waitForURL((url) => url.pathname === DETAIL_PATH);
});

test("the card's remove takes the title off, Undo puts it back, and an empty wishlist hides the shelf", async ({
	page,
}) => {
	await mockCatalog(page);
	await addFromDetail(page);
	await page.goto("/tabs/explore");
	await expect(card(page)).toBeVisible({ timeout: 10_000 });

	const remove = page.getByRole("button", { name: `Remove ${TITLE} from wishlist` });
	await remove.click();
	await expect(shelf(page)).toHaveCount(0);
	await page.getByRole("button", { name: "Undo" }).click();
	await expect(card(page)).toBeVisible();

	await page.goto("/tabs/explore/wishlist");
	await expect(card(page)).toBeVisible({ timeout: 10_000 });
	await remove.click();
	await expect(page.getByText(/Nothing on your wishlist yet/)).toBeVisible();
	// A top toast would sit over the first row's remove buttons for its whole 6 seconds.
	const toastBox = await page.locator("[data-sonner-toast]").boundingBox();
	const viewport = page.viewportSize();
	expect(toastBox && viewport && toastBox.y > viewport.height / 2).toBe(true);
});

test("importing from the card adds the book to the library and clears it from the wishlist", async ({
	page,
}) => {
	await mockCatalog(page);
	await addFromDetail(page);
	await page.goto("/tabs/explore/wishlist");
	await expect(card(page)).toBeVisible({ timeout: 10_000 });

	await page.getByRole("button", { name: `Add ${TITLE} to library` }).click();
	await expect(page.getByText(/Nothing on your wishlist yet/)).toBeVisible({ timeout: 20_000 });
	await page.goto("/tabs/library");
	await expect(
		page.locator(`[data-testid="library-card"][data-book-title="${TITLE}"]`),
	).toBeVisible({
		timeout: 10_000,
	});
});

type PushBody = { wishlist?: { ref: string; title: string; deleted: boolean }[] };

/** Signed in through Settings > Sync, with a server whose pull holds one title saved on another device. */
async function signInWithServerWishlist(page: Page) {
	const pushes: PushBody[] = [];
	const now = Date.now();
	await page.route("**/api/auth/get-session", (route) =>
		json(route, { user: { email: MOCK_EMAIL }, session: { token: MOCK_SESSION_TOKEN } }),
	);
	await page.route(/\/api\/social(\/|\?|$)/, (route) =>
		json(route, { items: [], nextCursor: null }),
	);
	await page.route(/\/api\/sync(\/|\?|$)/, (route) => {
		const req = route.request();
		if (req.method() === "POST" && new URL(req.url()).pathname === "/api/sync") {
			pushes.push(req.postDataJSON() as PushBody);
		}
		return json(route, {
			books: [],
			series: [],
			highlights: [],
			glossaryEntries: [],
			readingSessions: [],
			contentBookIds: [],
			wishlist: [
				{
					itemId: "remote-item-0001",
					kind: "catalog",
					ref: "gutenberg:77002",
					title: "Saved Elsewhere",
					author: null,
					coverUrl: null,
					deleted: false,
					createdAt: now,
					updatedAt: now,
				},
			],
		});
	});
	await mockPasswordSignIn(page);

	await page.goto("/");
	await page.waitForURL(/\/onboarding/, { timeout: 10_000 });
	await page.getByRole("button", { name: "Skip onboarding" }).click();
	await page.waitForURL(/\/tabs\/library/, { timeout: 10_000 });
	await page.goto("/tabs/settings/sync");
	await page.getByRole("button", { name: "Sign in with email and password" }).click();
	await page.getByLabel("Email").fill(MOCK_EMAIL);
	await page.getByLabel("Password").fill("hunter22");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page.getByText(`Signed in as ${MOCK_EMAIL}`)).toBeVisible({ timeout: 10_000 });
	return pushes;
}

test("signed in: a title saved on another device arrives on the shelf, and a save and a remove here are pushed", async ({
	page,
}) => {
	await mockCatalog(page);
	const pushes = await signInWithServerWishlist(page);

	await page.goto("/tabs/explore");
	await expect(
		shelf(page).getByTestId("wishlist-card").filter({ hasText: "Saved Elsewhere" }),
	).toBeVisible({ timeout: 15_000 });

	const pushedTitle = (deleted: boolean) => () =>
		pushes.some((p) => p.wishlist?.some((i) => i.ref === CATALOG_ID && i.deleted === deleted));

	await addFromDetail(page);
	await expect.poll(pushedTitle(false), { timeout: 15_000 }).toBe(true);

	await page.getByRole("button", { name: "Remove from wishlist" }).click();
	await expect(page.getByRole("button", { name: "Add to wishlist" })).toBeVisible();
	await expect.poll(pushedTitle(true), { timeout: 15_000 }).toBe(true);
});
