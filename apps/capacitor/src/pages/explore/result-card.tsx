import type React from "react";
import CoverImage from "../../components/cover-image";
import type { CatalogSearchResult } from "../../services/catalog/client";
import { getCoverUrl } from "../../services/catalog/client";

type Props = {
	result: CatalogSearchResult;
	onOpen: () => void;
};

/**
 * Explore grid card. Matches the visual rhythm of `BookCard` in the library so
 * both grids sit on the same bones on web + mobile.
 */
const ResultCard: React.FC<Props> = ({ result, onOpen }) => {
	const cover = getCoverUrl(result.id, result.coverUrl);
	const isSE = result.source === "standard_ebooks";

	return (
		<button
			type="button"
			className="flex w-full cursor-pointer select-none flex-col border-0 bg-transparent p-0 text-left text-[color:var(--ion-text-color,#000)] active:opacity-70"
			onClick={onOpen}
		>
			<div className="relative aspect-2/3 w-full overflow-hidden rounded-sm border border-[#d9d9d9] bg-[#f0f0f0]">
				<CoverImage src={cover} alt={result.title} />
				{isSE && (
					<span className="absolute top-1.5 right-1.5 rounded-sm bg-black px-1.5 py-0.5 font-semibold text-[0.6rem] text-white">
						SE
					</span>
				)}
			</div>

			<div className="px-0.5 pt-1">
				<div className="overflow-hidden text-ellipsis font-semibold text-[0.85rem] leading-[1.2] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">
					{result.title}
				</div>
				{result.author && (
					<div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[#888] text-[0.75rem]">
						{result.author}
					</div>
				)}
			</div>
		</button>
	);
};

export default ResultCard;
