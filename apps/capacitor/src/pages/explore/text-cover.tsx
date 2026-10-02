import type React from "react";
import type { SearchResult } from "../../services/serial-scrapers";
import { PROVIDER_BRAND_COLOR } from "./web-novels-providers";

/**
 * Stand-in cover for a series without art (all of AO3, RR's stock image):
 * the title and the fandom or author on a card tinted with the provider's
 * colour, so a grid of them stays scannable.
 */
const TextCover: React.FC<{ result: SearchResult; compact?: boolean }> = ({ result, compact }) => {
	const subtitle = result.details?.ao3?.fandoms[0] ?? result.author;
	const tint = PROVIDER_BRAND_COLOR[result.provider] ?? "#444";
	return (
		<div
			data-testid="text-cover"
			className="absolute inset-0 flex flex-col justify-end gap-1 p-2 text-left text-white"
			style={{
				background: `linear-gradient(160deg, ${tint}, color-mix(in srgb, ${tint} 55%, black))`,
			}}
		>
			<span
				className={`overflow-hidden font-semibold leading-tight [-webkit-box-orient:vertical] [display:-webkit-box] ${
					compact
						? "text-[0.55rem] [-webkit-line-clamp:3]"
						: "text-[0.75rem] [-webkit-line-clamp:4]"
				}`}
			>
				{result.title}
			</span>
			{subtitle && !compact && (
				<span className="truncate text-[0.6rem] text-white/75">{subtitle}</span>
			)}
		</div>
	);
};

export default TextCover;
