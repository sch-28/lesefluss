import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { STUB_CATALOG_ID, stubCatalog } from "./shots/catalog";
import { defineShots, type ShotContext, type ShotScreen } from "./shots/define";
import {
	bookId,
	COLLECTION_ID,
	type DataState,
	ensureLibrary,
	SERIAL_ID,
	seedLibrary,
} from "./shots/library";

const APP = "apps/capacitor";
const SRC = `${APP}/src`;
const SHELL = [
	`${SRC}/components/**`,
	`${SRC}/theme/**`,
	`${SRC}/contexts/**`,
	`${SRC}/pages/_shared/**`,
	"packages/ui/src/**",
];

// Commits that added a route after v2.1.1; before them the screen is not-in-ref.
const SINCE = {
	speedTest: "24c5d91c",
	wishlist: "9ab3f517",
	allSeries: "ce68dd85",
	bookEdit: "8326f9dd",
	importPage: "8326f9dd",
	collections: "cc63c80e",
	smartShelves: "7a9ce4b2",
	goalsAndStats: "3bfec482",
	speedAndDiagnostics: "3b775e98",
};

const NEEDS_ACCOUNT = "needs a signed-in account; the capture has no sync server";

// Tailwind variants like motion-safe:animate-spin keep the name only inside the class.
const BUSY = '[class*="animate-spin"], [class*="animate-pulse"], [aria-busy="true"]';

/** Spinners, skeletons, busy regions and the app's "Opening your library" screen gone, then 300 ms. */
async function settled(page: Page): Promise<void> {
	await page.waitForFunction(
		(busy) =>
			document.querySelector("#root")?.childElementCount &&
			!document.body.innerText.includes("Opening your library") &&
			![...document.querySelectorAll(busy)].some((el) => (el as HTMLElement).offsetParent !== null),
		BUSY,
		{ timeout: 15_000, polling: 100 },
	);
	await page.waitForTimeout(300);
}

type ScreenSpec = {
	id: string;
	area: string;
	route: string;
	url: (ctx: ShotContext) => string;
	paths: string[];
	state?: DataState;
	since?: string;
	until?: string;
	/** What the screen shows once its data loaded; the generic settle runs after it. */
	wait?: (page: Page) => Promise<unknown>;
	before?: (page: Page) => Promise<void>;
	/** Writes to the database (the reader saves its position), so the next screen restores. */
	dirty?: boolean;
};

function screen(s: ScreenSpec): ShotScreen<Page> {
	return {
		id: s.id,
		area: s.area,
		route: s.route,
		...(s.state && s.state !== "full" ? { dataState: s.state } : {}),
		...(s.since ? { since: s.since } : {}),
		...(s.until ? { until: s.until } : {}),
		paths: [...s.paths, ...SHELL],
		go: async (page, ctx) => {
			await ensureLibrary(page, ctx, s.state ?? "full", { dirty: s.dirty });
			await s.before?.(page);
			await page.goto(new URL(s.url(ctx), ctx.baseUrl).href);
		},
		ready: async (page) => {
			await s.wait?.(page);
			await settled(page);
		},
		capture: "fullPage",
	};
}

const pages = (...dirs: string[]) => dirs.map((d) => `${SRC}/pages/${d}/**`);
const routeFile = (file: string) => `${SRC}/routes/${file}`;
const fixed = (url: string) => () => url;
const heading = (name: string | RegExp) => (page: Page) =>
	page.getByRole("heading", { name }).first().waitFor({ timeout: 15_000 });
const text = (value: string) => (page: Page) =>
	page.getByText(value).first().waitFor({ timeout: 15_000 });
const fieldValue = (value: string) => (page: Page) =>
	page.waitForFunction(
		(v) => [...document.querySelectorAll("input")].some((el) => el.value === v),
		value,
		{ timeout: 15_000 },
	);
const bookCard = (page: Page) =>
	page.locator("[data-book-title]").first().waitFor({ timeout: 15_000 });

const settings = (
	slug: string,
	title: string | RegExp,
	since?: string,
	extraPaths: string[] = [],
): ShotScreen<Page> =>
	screen({
		id: `settings-${slug || "index"}`,
		area: "settings",
		route: `/tabs/settings/${slug}`,
		url: fixed(`/tabs/settings/${slug}`),
		paths: [routeFile(`tabs/settings/${slug || "index"}.tsx`), ...pages("settings"), ...extraPaths],
		since,
		wait: heading(title),
	});

const library = (state: DataState): ShotScreen<Page> =>
	screen({
		id: state === "full" ? "library" : `library-${state}`,
		area: "library",
		route: "/tabs/library/",
		url: fixed("/tabs/library"),
		paths: [routeFile("tabs/library/index.tsx"), ...pages("library")],
		state,
		wait:
			state === "empty"
				? (page) => page.getByRole("button", { name: "Add book" }).first().waitFor()
				: bookCard,
	});

export default defineShots<Page>({
	app: APP,
	playwright: APP,
	commands: [
		{
			// setup:web copies sql-wasm.wasm, which the build refuses to run without.
			build: "pnpm --filter lesefluss run setup:web && pnpm --filter lesefluss build",
			serve:
				"pnpm --filter lesefluss exec vite preview --port {port} --strictPort --host 127.0.0.1",
		},
	],
	seed: seedLibrary,
	// First paint only; the database's reader_theme, which ensureLibrary sets, is the app's theme.
	themeScript: (theme) =>
		`try { localStorage.setItem("app-theme", ${JSON.stringify(theme)}); } catch {}`,
	timeouts: { cellMs: 40_000 },
	screens: [
		library("empty"),
		library("few"),
		library("full"),
		screen({
			id: "library-stats",
			area: "library",
			route: "/tabs/library/stats",
			url: fixed("/tabs/library/stats"),
			paths: [routeFile("tabs/library/stats.tsx"), ...pages("library/stats")],
			// From here on the route only redirects to /tabs/stats.
			until: SINCE.goalsAndStats,
		}),
		screen({
			id: "all-series",
			area: "library",
			route: "/tabs/library/all-series",
			url: fixed("/tabs/library/all-series"),
			paths: [routeFile("tabs/library/all-series.tsx"), ...pages("library")],
			since: SINCE.allSeries,
		}),
		screen({
			id: "serial",
			area: "library",
			route: "/tabs/library/series/$id",
			url: fixed(`/tabs/library/series/${SERIAL_ID}`),
			paths: [routeFile("tabs/library/series.$id.tsx"), ...pages("library")],
			wait: heading("The Lantern Road"),
		}),
		screen({
			id: "book-detail",
			area: "library",
			route: "/tabs/library/book/$id",
			url: (ctx) => `/tabs/library/book/${bookId(ctx, "The Time Machine")}`,
			paths: [routeFile("tabs/library/book.$id.tsx"), ...pages("library")],
			// The reading chart animates with react-spring, which reduced motion does not stop.
			wait: async (page) => {
				await heading("The Time Machine")(page);
				await page.waitForTimeout(1_500);
			},
		}),
		screen({
			id: "book-edit",
			area: "library",
			route: "/tabs/library/book/$id/edit",
			url: (ctx) => `/tabs/library/book/${bookId(ctx, "The Time Machine")}/edit`,
			paths: [routeFile("tabs/library/book.$id_.edit.tsx"), ...pages("library")],
			since: SINCE.bookEdit,
			wait: fieldValue("The Time Machine"),
		}),
		screen({
			id: "import",
			area: "library",
			route: "/tabs/library/import",
			url: fixed("/tabs/library/import"),
			paths: [routeFile("tabs/library/import.tsx"), ...pages("library")],
			since: SINCE.importPage,
		}),
		screen({
			id: "collection-new",
			area: "library",
			route: "/tabs/library/collections/new",
			url: fixed("/tabs/library/collections/new"),
			paths: [routeFile("tabs/library/collections.new.tsx"), ...pages("library")],
			since: SINCE.collections,
		}),
		screen({
			id: "collection-add",
			area: "library",
			route: "/tabs/library/collections/$id/add",
			url: fixed(`/tabs/library/collections/${COLLECTION_ID}/add`),
			paths: [routeFile("tabs/library/collections.$id.add.tsx"), ...pages("library")],
			since: SINCE.collections,
			wait: text("Add to Gothic and strange"),
		}),
		screen({
			id: "collection-edit",
			area: "library",
			route: "/tabs/library/collections/$id/edit",
			url: fixed(`/tabs/library/collections/${COLLECTION_ID}/edit`),
			paths: [routeFile("tabs/library/collections.$id.edit.tsx"), ...pages("library")],
			since: SINCE.collections,
			wait: fieldValue("Gothic and strange"),
		}),
		screen({
			id: "shelf-new",
			area: "library",
			route: "/tabs/library/shelves/new",
			url: fixed("/tabs/library/shelves/new"),
			paths: [routeFile("tabs/library/shelves.new.tsx"), ...pages("library")],
			since: SINCE.smartShelves,
		}),
		screen({
			id: "stats",
			area: "stats",
			route: "/tabs/stats",
			url: fixed("/tabs/stats"),
			paths: [routeFile("tabs/stats.tsx"), ...pages("library/stats"), `${SRC}/services/stats/**`],
			since: SINCE.goalsAndStats,
			wait: text("Totals"),
		}),
		screen({
			id: "explore",
			area: "explore",
			route: "/tabs/explore/",
			url: fixed("/tabs/explore"),
			paths: [
				routeFile("tabs/explore/index.tsx"),
				...pages("explore"),
				`${SRC}/services/catalog/**`,
			],
			before: stubCatalog,
			wait: text("Pride and Prejudice"),
		}),
		screen({
			id: "explore-search",
			area: "explore",
			route: "/tabs/explore/",
			url: fixed("/tabs/explore?q=the"),
			paths: [
				routeFile("tabs/explore/index.tsx"),
				...pages("explore"),
				`${SRC}/services/catalog/**`,
			],
			before: stubCatalog,
			wait: text("The Time Machine"),
		}),
		screen({
			id: "explore-book",
			area: "explore",
			route: "/tabs/explore/book/$catalogId",
			url: fixed(`/tabs/explore/book/${encodeURIComponent(STUB_CATALOG_ID)}`),
			paths: [routeFile("tabs/explore/book.$catalogId.tsx"), ...pages("explore")],
			before: stubCatalog,
			wait: heading("Frankenstein"),
		}),
		screen({
			id: "explore-tags",
			area: "explore",
			route: "/tabs/explore/tags",
			url: fixed("/tabs/explore/tags"),
			paths: [routeFile("tabs/explore/tags.tsx"), ...pages("explore")],
			before: stubCatalog,
		}),
		screen({
			id: "explore-web-novels",
			area: "explore",
			route: "/tabs/explore/web-novels",
			url: fixed("/tabs/explore/web-novels"),
			paths: [routeFile("tabs/explore/web-novels.tsx"), ...pages("explore")],
		}),
		screen({
			id: "wishlist",
			area: "explore",
			route: "/tabs/explore/wishlist",
			url: fixed("/tabs/explore/wishlist"),
			paths: [routeFile("tabs/explore/wishlist.tsx"), ...pages("explore")],
			since: SINCE.wishlist,
		}),
		screen({
			id: "social",
			area: "social",
			route: "/tabs/social/",
			url: fixed("/tabs/social"),
			paths: [routeFile("tabs/social/index.tsx"), ...pages("social")],
		}),
		settings("", "Settings"),
		settings("general", "General"),
		settings("reader", "Reader"),
		settings("rsvp", /RSVP/),
		settings("read-aloud", "Listen"),
		settings("goals", /Goals/, SINCE.goalsAndStats, pages("library/reading-goal")),
		settings("speed", /Speed/, SINCE.speedAndDiagnostics),
		settings("notifications", "Notifications"),
		settings("sync", "Cloud sync"),
		settings("social", /Social/),
		settings("export", /Export/),
		settings("diagnostics", /Diagnostics/, SINCE.speedAndDiagnostics),
		settings("licenses", "Open source licenses"),
		screen({
			id: "onboarding",
			area: "onboarding",
			route: "/onboarding",
			url: fixed("/onboarding"),
			paths: [routeFile("onboarding.tsx"), ...pages("onboarding")],
		}),
		screen({
			id: "speed-test",
			area: "onboarding",
			route: "/speed-test",
			url: fixed("/speed-test"),
			paths: [routeFile("speed-test.tsx"), ...pages("speed-test")],
			since: SINCE.speedTest,
		}),
		screen({
			id: "reader",
			area: "reader",
			route: "/tabs/reader/$id",
			url: (ctx) => `/tabs/reader/${bookId(ctx, "Moby Dick")}`,
			paths: [routeFile("tabs/reader.$id.tsx"), ...pages("reader")],
			wait: text("Time Traveller"),
			dirty: true,
		}),
	],
	routes: {
		list: (root) => {
			const tree = readFileSync(join(root, SRC, "routeTree.gen.ts"), "utf8");
			const block = /^ {2}fullPaths:\n((?: {4}\| '[^']*'\n)+)/m.exec(tree)?.[1] ?? "";
			const paths = [...block.matchAll(/'([^']*)'/g)].map((m) => m[1] as string);
			if (!paths.length) throw new Error("no fullPaths in routeTree.gen.ts");
			return paths;
		},
		ignore: {
			"/": "redirects to the library, or to onboarding before it is done",
			"/tabs/settings/device": "the web build redirects it to /tabs/settings",
			"/tabs/explore/web-novel-preview":
				"previews a serial fetched from its site; the capture has no outside network",
			"/tabs/social/blocked": NEEDS_ACCOUNT,
			"/tabs/social/buddy-reads": NEEDS_ACCOUNT,
			"/tabs/social/friends": NEEDS_ACCOUNT,
			"/tabs/social/inbox": NEEDS_ACCOUNT,
			"/tabs/social/invite-link": NEEDS_ACCOUNT,
			"/tabs/social/buddy-read/$id": NEEDS_ACCOUNT,
			"/tabs/social/buddy-read-discussion/$id": NEEDS_ACCOUNT,
			"/tabs/social/invite/$token": "needs an invite the sync server issued",
			"/tabs/social/profile/$userId": NEEDS_ACCOUNT,
		},
	},
});
