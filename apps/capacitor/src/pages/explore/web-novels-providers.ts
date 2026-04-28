import { Feather, Mountain, PenLine, Sword } from "lucide-react";
import type { ComponentType, CSSProperties, SVGProps } from "react";
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

/** Lucide icon component used as the visual mark on each provider card. */
export const PROVIDER_ICON: Partial<
	Record<ProviderId, ComponentType<SVGProps<SVGSVGElement>>>
> = {
	ao3: Feather,
	scribblehub: PenLine,
	royalroad: Sword,
	wuxiaworld: Mountain,
};

/**
 * Pre-built per-provider card style. Sets a `--brand` custom property the CSS
 * derives every brand-tinted surface from (icon badge bg, icon stroke, corner
 * wash). Hoisted out of render so the JSX doesn't allocate a fresh `style`
 * object per card on every render.
 */
export const PROVIDER_CARD_STYLE: Partial<Record<ProviderId, CSSProperties>> =
	Object.fromEntries(
		(Object.entries(PROVIDER_BRAND_COLOR) as [ProviderId, string][]).map(([id, color]) => [
			id,
			{ "--brand": color } as CSSProperties,
		]),
	);

/**
 * Providers shown in the section + filter chip row, in display order. Add a
 * provider here once its adapter lands in `serial-scrapers/registry.ts`.
 */
export const VISIBLE_PROVIDERS: ProviderId[] = ["ao3", "scribblehub", "royalroad", "wuxiaworld"];

/** URL-param guard for `?provider=`. */
export const isVisibleProvider = (s: string): s is ProviderId =>
	(VISIBLE_PROVIDERS as readonly string[]).includes(s);
