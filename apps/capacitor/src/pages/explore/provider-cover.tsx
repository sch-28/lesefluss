import type React from "react";
import { TintedCover } from "../../components/tinted-cover";
import type { SearchResult } from "../../services/serial-scrapers";
import { PROVIDER_BRAND_COLOR, PROVIDER_FALLBACK_COLOR } from "./web-novels-providers";

/** A web novel without art (all of AO3, RR's stock image), tinted with its provider's colour. */
const ProviderCover: React.FC<{ result: SearchResult; compact?: boolean }> = ({
	result,
	compact,
}) => (
	<TintedCover
		title={result.title}
		tint={PROVIDER_BRAND_COLOR[result.provider] ?? PROVIDER_FALLBACK_COLOR}
		compact={compact}
	/>
);

export default ProviderCover;
