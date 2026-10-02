import { expect, type Page, type Route, test } from "@playwright/test";
import { resetStorage } from "./helpers/seed";

const CATALOG_HOST = "https://catalog.lesefluss.app";

const book = (id: string, source: string, title: string) => ({
	id,
	source,
	title,
	author: "Mock Author",
	language: "en",
	subjects: ["Ghost stories"],
	summary: null,
	coverUrl: null,
	hasEpub: true,
});

const ALPHA = book("se:mock/alpha", "standard_ebooks", "Alpha Ghosts");
const BETA = book("gutenberg:4242", "gutenberg", "Beta Ghosts");
const GAMMA = book("gutenberg:4343", "gutenberg", "Gamma Romance");

const TAGS = [
	{ id: "ghost-stories", label: "Ghost stories", count: 2 },
	{ id: "romance", label: "Romance", count: 1 },
	{ id: "short-stories", label: "Short stories", count: 40 },
];

/** Every catalog endpoint Explore touches, answered from fixtures. Logs /search params. */
async function mockCatalog(page: Page) {
	const searches: URLSearchParams[] = [];
	const json = (route: Route, body: unknown, status = 200) =>
		route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

	await page.route(`${CATALOG_HOST}/**`, (route) => {
		const url = new URL(route.request().url());
		const path = url.pathname;
		if (path === "/languages")
			return json(route, { total: 3, languages: [{ code: "en", count: 3 }] });
		if (path === "/genres") {
			return json(route, {
				lang: "en",
				genres: [{ id: "horror", label: "Horror & Gothic", count: 2 }],
			});
		}
		if (path === "/landing") {
			return json(route, {
				lang: "en",
				featured_se: [],
				classics: [],
				most_read: [ALPHA],
				genres: [{ id: "horror", label: "Horror & Gothic", books: [] }],
			});
		}
		if (path.startsWith("/shelves/random")) return json(route, { results: [] });
		if (path === "/tags") {
			const q = url.searchParams.get("q") ?? "";
			return json(route, {
				lang: "en",
				total: TAGS.length,
				tags: TAGS.filter((t) => t.label.toLowerCase().includes(q)),
			});
		}
		if (path === "/search") {
			searches.push(url.searchParams);
			const known = new Set(TAGS.map((t) => t.id));
			const tags = (url.searchParams.get("tag") ?? "").split(",").filter((t) => known.has(t));
			if (url.searchParams.get("genre") === "horror") {
				const many = Array.from({ length: 24 }, (_, i) =>
					book(`gutenberg:${5000 + i}`, "gutenberg", `Long Shelf ${i}`),
				);
				return json(route, {
					q: "",
					lang: "en",
					genre: "horror",
					sort: "popular",
					page: 1,
					limit: 24,
					total: 24,
					results: many,
					suggestion: null,
				});
			}
			let results = [ALPHA, BETA, GAMMA];
			if (tags.includes("ghost-stories")) results = [ALPHA, BETA];
			if (tags.includes("romance")) results = results.filter((b) => b === GAMMA);
			const facets = url.searchParams.get("facets")
				? { tags: TAGS.filter((t) => !tags.includes(t.id) && t.id !== "short-stories") }
				: undefined;
			return json(route, {
				q: url.searchParams.get("q") ?? "",
				lang: "en",
				genre: null,
				sort: url.searchParams.get("sort") ?? "popular",
				page: 1,
				limit: 24,
				tags,
				total: results.length,
				results,
				facets,
				suggestion: null,
			});
		}
		if (path.startsWith("/books/similar/")) return json(route, { results: [] });
		if (path.startsWith("/books/") && !path.startsWith("/books/epub/")) {
			return json(route, {
				...BETA,
				description: null,
				epubUrl: null,
				tags: [
					{ id: "ghost-stories", label: "Ghost stories" },
					{ id: "short-stories", label: "Short stories" },
				],
			});
		}
		// Web-novel providers go through the article proxy on web; fail them all.
		if (path === "/proxy/article") return json(route, { error: "down" }, 502);
		return route.fulfill({ status: 404, body: "" });
	});
	return { searches };
}

test.beforeEach(async ({ page }) => {
	await resetStorage(page);
});

test("a tag on a book opens results for that tag, restored on reload and back", async ({
	page,
}) => {
	const { searches } = await mockCatalog(page);
	await page.goto(`/tabs/explore/book/${encodeURIComponent(BETA.id)}`);
	await page.getByRole("button", { name: "Ghost stories" }).click();

	await page.waitForURL(/\/tabs\/explore\?tags=ghost-stories/);
	const cards = page.getByTestId("catalog-card");
	await expect(cards.filter({ hasText: "Alpha Ghosts" })).toBeVisible();
	await expect(cards.filter({ hasText: "Beta Ghosts" })).toBeVisible();
	await expect(cards.filter({ hasText: "Gamma Romance" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Remove tag Ghost stories" })).toBeVisible();
	expect(searches.at(-1)?.get("tag")).toBe("ghost-stories");

	await page.reload();
	await expect(cards.filter({ hasText: "Beta Ghosts" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Remove tag Ghost stories" })).toBeVisible();

	await page.goBack();
	await page.waitForURL(/\/tabs\/explore\/book\//);
});

test("facet chips add tags and active chips remove them", async ({ page }) => {
	const { searches } = await mockCatalog(page);
	await page.goto("/tabs/explore?tags=ghost-stories");
	await expect(page.getByText("Alpha Ghosts")).toBeVisible();

	await page.getByRole("button", { name: "Add tag Romance" }).click();
	await page.waitForURL(/tags=ghost-stories%2Cromance|tags=ghost-stories,romance/);
	expect(searches.at(-1)?.get("tag")).toBe("ghost-stories,romance");

	await page.getByRole("button", { name: "Remove tag Ghost stories" }).click();
	await page.waitForURL((url) => url.searchParams.get("tags") === "romance");
	await expect(page.getByText("Gamma Romance")).toBeVisible();
});

test("sort and source live in the URL and combine with tags", async ({ page }) => {
	const { searches } = await mockCatalog(page);
	await page.goto("/tabs/explore?tags=ghost-stories");
	await expect(page.getByText("Alpha Ghosts")).toBeVisible();

	await page.getByRole("button", { name: "Popular" }).click();
	await page.getByRole("menuitemradio", { name: "Title A-Z" }).click();
	await page.waitForURL((url) => url.searchParams.get("sort") === "title");

	await page.getByRole("button", { name: "Source" }).click();
	await page.getByRole("menuitemradio", { name: "Standard Ebooks" }).click();
	await page.waitForURL((url) => url.searchParams.get("source") === "standard_ebooks");

	const last = searches.at(-1);
	expect(last?.get("sort")).toBe("title");
	expect(last?.get("source")).toBe("standard_ebooks");
	expect(last?.get("tag")).toBe("ghost-stories");

	await page.reload();
	await expect(page.getByRole("button", { name: "Title A-Z" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Standard Ebooks", exact: true })).toBeVisible();
});

test("the search query is in the URL, survives a detail round trip and becomes a recent search", async ({
	page,
}) => {
	await mockCatalog(page);
	await page.goto("/tabs/explore");
	const field = page.getByRole("searchbox", { name: "Search books and web novels" });
	await field.fill("ghosts");
	await page.waitForURL((url) => url.searchParams.get("q") === "ghosts");
	await expect(page.getByText(/Public domain/)).toBeVisible();
	// Providers are down in this mock; that is reported, not fatal.
	await expect(page.getByText(/didn't respond/)).toBeVisible({ timeout: 20_000 });

	await page.getByText("Beta Ghosts").first().click();
	await page.waitForURL(/\/tabs\/explore\/book\//);
	await page.goBack();
	await page.waitForURL((url) => url.searchParams.get("q") === "ghosts");
	await expect(field).toHaveValue("ghosts");

	await page.getByRole("button", { name: "Clear search" }).click();
	await field.focus();
	const recent = page.getByRole("region", { name: "Recent searches" });
	await expect(recent.getByRole("button", { name: "ghosts", exact: true })).toBeVisible();
	await recent.getByRole("button", { name: "ghosts", exact: true }).click();
	await page.waitForURL((url) => url.searchParams.get("q") === "ghosts");
});

test("the tag browse page is reachable from the landing and filters by name", async ({ page }) => {
	await mockCatalog(page);
	await page.goto("/tabs/explore");
	await page.getByRole("button", { name: "Browse by tag" }).click();
	await page.waitForURL(/\/tabs\/explore\/tags/);
	await expect(page.getByText("Short stories")).toBeVisible();

	await page.getByRole("searchbox", { name: "Filter tags" }).fill("ghost");
	await expect(page.getByText("Short stories")).toHaveCount(0);
	await page.getByRole("button", { name: /Ghost stories/ }).click();
	await page.waitForURL((url) => url.searchParams.get("tags") === "ghost-stories");
	await expect(page.getByText("Beta Ghosts")).toBeVisible();
});

test("returning from a book restores the results scroll position", async ({ page }) => {
	await mockCatalog(page);
	await page.setViewportSize({ width: 400, height: 700 });
	await page.goto("/tabs/explore?genre=horror&view=list");
	await expect(page.getByText("Long Shelf 23")).toBeAttached();

	const scroller = page.locator('[data-scroll-restoration-id="app-scroll"]');
	await page.getByText("Long Shelf 15").scrollIntoViewIfNeeded();
	const before = await scroller.evaluate((el) => el.scrollTop);
	expect(before).toBeGreaterThan(300);

	await page.getByText("Long Shelf 15").click();
	await page.waitForURL(/\/tabs\/explore\/book\//);
	await page.goBack();
	await page.waitForURL((url) => url.searchParams.get("genre") === "horror");
	await expect
		.poll(() => scroller.evaluate((el) => el.scrollTop), { timeout: 5_000 })
		.toBeGreaterThan(before - 50);
});

test("a shared link with a tag the catalog no longer has drops just that chip", async ({
	page,
}) => {
	await mockCatalog(page);
	await page.goto("/tabs/explore?tags=ghost-stories,gone-tag");
	await page.waitForURL((url) => url.searchParams.get("tags") === "ghost-stories");
	await expect(page.getByText("Alpha Ghosts")).toBeVisible();
	await expect(page.getByRole("button", { name: /Remove tag Gone tag/ })).toHaveCount(0);
});

test("back from results returns to the landing instead of leaving Explore", async ({ page }) => {
	await mockCatalog(page);
	await page.goto("/tabs/library");
	await page.goto("/tabs/explore");
	await page.getByRole("button", { name: "Horror & Gothic" }).last().click();
	await page.waitForURL((url) => url.searchParams.get("genre") === "horror");
	await page.goBack();
	await page.waitForURL(
		(url) => url.pathname === "/tabs/explore" && !url.searchParams.get("genre"),
	);
	await expect(page.getByRole("button", { name: "Browse by tag" })).toBeVisible();
});

test("the length chip filters by reading time at the reader's speed", async ({ page }) => {
	const { searches } = await mockCatalog(page);
	await page.goto("/tabs/explore?tags=ghost-stories");
	await expect(page.getByText("Alpha Ghosts")).toBeVisible();
	await page.getByRole("button", { name: "Length" }).click();
	await page.getByRole("menuitemradio", { name: "Under 1 hour" }).click();
	await page.waitForURL((url) => url.searchParams.get("length") === "short");
	// Default reading speed is 350 wpm, so one hour is 21,000 words.
	expect(searches.at(-1)?.get("max_words")).toBe("21000");
	expect(searches.at(-1)?.get("min_words")).toBeNull();
});

test("a tag picked on the tag page adds to the search it was opened from", async ({ page }) => {
	await mockCatalog(page);
	await page.goto("/tabs/explore?tags=romance&lang=en");
	await expect(page.getByText("Gamma Romance")).toBeVisible();
	await page.getByRole("button", { name: "Tags", exact: true }).click();
	await page.waitForURL(/\/tabs\/explore\/tags/);
	await page.getByRole("button", { name: /Ghost stories/ }).click();
	await page.waitForURL(
		(url) =>
			url.pathname === "/tabs/explore" && url.searchParams.get("tags") === "romance,ghost-stories",
	);
});
