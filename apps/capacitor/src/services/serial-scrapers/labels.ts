import type { ProviderId } from "./types";

/**
 * Display labels for each `ProviderId`. Used by SeriesDetail and SerialPreview
 * (and any future provider-aware UI) so a single source of truth controls how
 * provider names are presented across the app.
 *
 * Type-safe: adding a new `ProviderId` to `types.ts` without a label here is
 * a TypeScript error — the `Record<ProviderId, …>` shape forces the update.
 */
export const PROVIDER_LABEL: Record<ProviderId, string> = {
	ao3: "Archive of Our Own",
	scribblehub: "ScribbleHub",
	royalroad: "Royal Road",
	ffnet: "Fanfiction.net",
	wuxiaworld: "Wuxiaworld",
	rss: "RSS",
};

export function providerLabel(provider: ProviderId | string): string {
	return PROVIDER_LABEL[provider as ProviderId] ?? provider;
}

export function chapterCountLabel(count: number): string {
	return `${count} chapter${count === 1 ? "" : "s"}`;
}
