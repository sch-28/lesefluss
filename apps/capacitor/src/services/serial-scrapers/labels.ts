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

/**
 * Render a chapter count for the UI. Two variants:
 *   long  (default) → "23 chapters" / "1 chapter"  — used in detail stats lines
 *   short            → "23 chap." / "1 chap."      — used in compact badges
 *
 * Centralized so vocabulary stays consistent across cards, badges, and detail
 * pages. Changing "chapters" to "ch." everywhere is one edit here.
 */
export function chapterCountLabel(count: number, opts: { short?: boolean } = {}): string {
	if (opts.short) return `${count} chap.`;
	return `${count} chapter${count === 1 ? "" : "s"}`;
}
