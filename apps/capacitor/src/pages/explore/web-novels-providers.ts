import type { ProviderId } from "../../services/serial-scrapers";

/**
 * UI-side configuration for the Web-novels Explore section + filter chips.
 * Kept separate from the `serial-scrapers/registry.ts` `SCRAPERS` list so we
 * can ship an adapter without surfacing its filter chip until the UI is ready
 * (and vice versa). Section-local — not display-text logic; that's `labels.ts`.
 */

/** Brand accents for provider chips. Used by the section CTA + filter chips. */
export const PROVIDER_BRAND_COLOR: Partial<Record<ProviderId, string>> = {
	ao3: "#990000",
	scribblehub: "#1f5f99",
	royalroad: "#1d4f1d",
	ffnet: "#3a7388",
	wuxiaworld: "#5e2a82",
};

/**
 * Per-card label override. Falls back to the global `providerLabel()` when
 * unset. Used to keep names on a single line at the card's narrow width
 * (`Archive of Our Own` → `AO3`); the search page still shows the full label.
 */
export const PROVIDER_CARD_LABEL: Partial<Record<ProviderId, string>> = {
	ao3: "AO3",
};

/** One-line subtitle shown under the provider name on the CTA card. */
export const PROVIDER_SUBTITLE: Partial<Record<ProviderId, string>> = {
	ao3: "Fanfiction",
	scribblehub: "Original serials",
	royalroad: "LitRPG & fantasy",
	wuxiaworld: "Translated xianxia",
};

/**
 * URL opened in the Cloudflare challenge WebView. Points at the actual page
 * OkHttp fetches for popular/search so CF is more likely to issue cf_clearance
 * for the same path patterns it blocks.
 */
export const PROVIDER_CHALLENGE_URL: Partial<Record<ProviderId, string>> = {
	scribblehub: "https://www.scribblehub.com/series-ranking/?sort=2&order=",
	royalroad: "https://www.royalroad.com/fictions/best-rated",
	wuxiaworld: "https://www.wuxiaworld.com/novels",
	ao3: "https://archiveofourown.org",
};

/**
 * Providers shown in the section + filter chip row, in display order. Add a
 * provider here once its adapter lands in `serial-scrapers/registry.ts`.
 */
export const VISIBLE_PROVIDERS: ProviderId[] = ["wuxiaworld", "royalroad", "ao3", "scribblehub"];

/** URL-param guard for `?provider=`. */
export const isVisibleProvider = (s: string): s is ProviderId =>
	(VISIBLE_PROVIDERS as readonly string[]).includes(s);
