import { expect, type Page, type Route, test } from "@playwright/test";
import { BIG_BOOK_TITLE, seedBigBook } from "./helpers/big-book";
import { textLayoutProblems, textLayoutProblemsWhileScrolling } from "./helpers/layout-check";
import { openBookFromLibrary, resetStorage } from "./helpers/seed";
import { emulateTextZoom, zoomedSizes } from "./helpers/text-zoom";
import { reader } from "./page-objects/reader";

/**
 * No text runs off screen, out of its button, into other text, or is cut or
 * truncated past half, at Android's largest system font scale (200 %, which
 * WebView applies as textZoom) on a Pixel-sized phone, and at 100 % on the
 * narrowest common phone (360 px), where the large-scale fixes must not kick in.
 * Motion is reduced so no sheet is caught mid-slide.
 */

test.use({ contextOptions: { reducedMotion: "reduce" } });

const SETTINGS_PAGES = [
	"",
	"general",
	"reader",
	"read-aloud",
	"rsvp",
	"export",
	"notifications",
	"sync",
	"social",
	"device",
	"licenses",
];

const SCALES = [
	{ name: "200 % on a 412 px phone", factor: 2, viewport: { width: 412, height: 915 } },
	{ name: "100 % on a 360 px phone", factor: 1, viewport: { width: 360, height: 740 } },
];

/** Every catalog endpoint Explore's landing touches, answered with one shelf. */
async function mockCatalog(page: Page) {
	const book = {
		id: "gutenberg:4242",
		source: "gutenberg",
		title: "A Rather Long Title for a Public-Domain Ghost Story Collection",
		author: "Mock Author",
		language: "en",
		subjects: ["Ghost stories"],
		summary: null,
		coverUrl: null,
		hasEpub: true,
	};
	const json = (route: Route, body: unknown) =>
		route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
	await page.route("https://catalog.lesefluss.app/**", (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path === "/languages")
			return json(route, { total: 1, languages: [{ code: "en", count: 1 }] });
		if (path === "/genres") {
			return json(route, {
				lang: "en",
				genres: [{ id: "horror", label: "Horror & Gothic", count: 1 }],
			});
		}
		if (path === "/landing") {
			return json(route, {
				lang: "en",
				featured_se: [],
				classics: [book],
				most_read: [book],
				genres: [{ id: "horror", label: "Horror & Gothic", books: [book] }],
			});
		}
		if (path.startsWith("/shelves/random")) return json(route, { results: [book] });
		if (path === "/tags") return json(route, { lang: "en", total: 0, tags: [] });
		return route.fulfill({ status: 404, body: "" });
	});
}

async function expectFits(page: Page, what: string, root?: string) {
	const problems = root
		? await textLayoutProblems(page, root)
		: await textLayoutProblemsWhileScrolling(page);
	expect(problems, what).toEqual([]);
}

for (const scale of SCALES) {
	test.describe(scale.name, () => {
		test.use({ viewport: scale.viewport });

		test.beforeEach(async ({ page }) => {
			await emulateTextZoom(page, scale.factor);
		});

		test("onboarding fits", async ({ page }) => {
			await resetStorage(page);
			await page.goto("/");
			await page.waitForURL(/\/onboarding/);
			await expect(page.getByRole("button", { name: "Skip onboarding" })).toBeVisible();
			await expectFits(page, "onboarding");
		});

		test("the library, stats, explore and every settings page fit", async ({ page }) => {
			await mockCatalog(page);
			await seedBigBook(page);
			for (const route of ["/tabs/library", "/tabs/library/stats"]) {
				await page.goto(route);
				await expect(page.locator("nav").last()).toBeVisible();
				expect((await zoomedSizes(page)).root, "the zoom took").toBe(`${16 * scale.factor}px`);
				await expectFits(page, route);
			}
			await page.goto("/tabs/explore");
			await expect(page.getByText("Mock Author").first()).toBeVisible();
			await expectFits(page, "/tabs/explore");
			for (const sub of SETTINGS_PAGES) {
				const route = `/tabs/settings/${sub}`;
				await page.goto(route);
				await expect(page.locator("header h1").first()).toBeVisible();
				await expectFits(page, route);
			}
		});

		test("the reader, its popover, sheets, selection toolbar, RSVP and the book page fit", async ({
			page,
		}) => {
			await seedBigBook(page);
			await openBookFromLibrary(page, BIG_BOOK_TITLE);
			await reader.expectLoaded(page);
			await reader.waitOpenSettled(page);
			expect(await zoomedSizes(page), "the zoom took: root and reading text").toEqual({
				root: `${16 * scale.factor}px`,
				readingText: `${16 * scale.factor}px`,
			});
			await expectFits(page, "reader", "body");

			await reader.openAppearance(page);
			await expectFits(page, "appearance", ".appearance-popover-content");
			await page.keyboard.press("Escape");
			await expect(page.locator(".appearance-popover-content")).toHaveCount(0);

			await page.getByRole("button", { name: "Annotations" }).click();
			const sheet = '[data-slot="drawer-content"]';
			await expect(page.locator(sheet)).toBeVisible();
			await expectFits(page, "annotations", sheet);
			await page.keyboard.press("Escape");
			await expect(page.locator(sheet)).toHaveCount(0);

			await reader.selectWords(page, "contains", "enough");
			await expect(page.locator(".selection-toolbar")).toBeVisible();
			await expectFits(page, "selection toolbar", ".selection-toolbar");
			await reader.dismissSelection(page);

			await reader.toggleRsvp(page);
			await expect(page.locator(".rsvp-display")).toBeVisible();
			await expectFits(page, "rsvp", "body");
			await reader.toggleRsvp(page);
			await expect(page.locator(".rsvp-display")).toBeHidden();

			await page.getByRole("button", { name: "More actions" }).click();
			await page.getByRole("menuitem", { name: "View book" }).click();
			await page.waitForURL(/\/tabs\/library\/book\//);
			await expectFits(page, "book page");
			await page.getByTestId("goal-entry").getByRole("button", { name: "Set goal" }).click();
			await expect(page.getByRole("dialog")).toBeVisible();
			await expectFits(page, "goal sheet", '[role="dialog"]');
		});
	});
}

// The controls: each rule of the check fires on a case made to break it.
test("the layout check reports each kind of text that does not fit", async ({ page }) => {
	await page.goto("/");
	await page.setContent(`
		<div style="width:300px;margin-top:40px;font:16px sans-serif">
			<div id="overlap" style="position:relative;height:20px">
				<span style="position:absolute;left:0">Overlapping</span>
				<span style="position:absolute;left:10px">text</span>
			</div>
			<button id="spill-x" style="width:20px;white-space:nowrap">Spilling label</button>
			<button id="spill-y" style="height:6px;line-height:20px;overflow:visible">Tall</button>
			<div id="clip-x" style="width:30px;overflow:hidden;white-space:nowrap">Clipped sideways</div>
			<div id="clip-y" style="height:8px;overflow:hidden">Clipped below</div>
			<div data-clips-text style="height:8px;overflow:hidden">Clipped on purpose</div>
			<button style="width:20px;white-space:nowrap"><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">Screen reader only</span></button>
			<div style="width:30px;height:20px;overflow:hidden;white-space:nowrap">Clipped but seen</div>
			<div style="margin-left:280px;white-space:nowrap">Runs off screen</div>
			<div style="width:30px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Mostly hidden behind an ellipsis</div>
			<div style="width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Mostly shown</div>
			<div style="width:100px;overflow-x:auto;overflow-y:hidden;white-space:nowrap">A horizontal strip that scrolls sideways past the screen edge on purpose</div>
		</div>
		<header style="position:fixed;top:0;left:0;right:0;height:30px;background:#fff">Bar</header>
		<div style="position:fixed;top:4px;left:0">Covered</div>`);
	await page.setViewportSize({ width: 320, height: 400 });
	const problems = await textLayoutProblems(page);
	const has = (prefix: string, text: string) =>
		problems.some((p) => p.startsWith(prefix) && p.includes(text));
	expect(has("overlap", "Overlapping")).toBe(true);
	expect(has("spills out of its control", "Spilling")).toBe(true);
	expect(has("spills out of its control", "Tall")).toBe(true);
	expect(has("clipped", "Clipped sideways")).toBe(true);
	expect(has("clipped", "Clipped below")).toBe(true);
	expect(has("clipped", "on purpose")).toBe(false);
	// Visually hidden (sr-only) text is for screen readers, not on screen; a small box that
	// still shows part of its text is clipping all the same.
	expect(problems.some((p) => p.includes("Screen reader only"))).toBe(false);
	expect(has("clipped", "Clipped but seen")).toBe(true);
	expect(has("off screen", "Runs off screen")).toBe(true);
	expect(has("truncated", "Mostly hidden")).toBe(true);
	expect(has("truncated", "Mostly shown")).toBe(false);
	expect(problems.some((p) => p.includes("horizontal strip"))).toBe(false);
	// Under the fixed header: not on screen, so no collision with its text.
	expect(problems.some((p) => p.includes("Covered"))).toBe(false);
});
