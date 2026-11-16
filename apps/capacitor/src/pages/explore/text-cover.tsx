import type React from "react";
import { TextCover as SharedTextCover } from "../../components/text-cover";
import type { SearchResult } from "../../services/serial-scrapers";
import { PROVIDER_BRAND_COLOR } from "./web-novels-providers";

/** A web novel without art (all of AO3, RR's stock image), tinted with its provider's colour. */
const TextCover: React.FC<{ result: SearchResult; compact?: boolean }> = ({ result, compact }) => (
	<SharedTextCover
		title={result.title}
		author={result.details?.ao3?.fandoms[0] ?? result.author}
		tint={PROVIDER_BRAND_COLOR[result.provider] ?? "#444"}
		compact={compact}
	/>
);

export default TextCover;
