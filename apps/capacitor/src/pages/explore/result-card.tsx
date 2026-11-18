import type React from "react";
import { CARD_TITLE } from "@/components/card";
import CoverImage from "../../components/cover-image";
import type { CatalogSearchResult } from "../../services/catalog/client";
import { getCoverUrl } from "../../services/catalog/client";
import { CardMeta, QuickAddOnCover } from "./card-badges";
import type { LengthLabels } from "./length";

type Props = {
	result: CatalogSearchResult;
	onOpen: () => void;
	isInLibrary?: boolean;
	/** Omit to hide quick add (in library, no EPUB, or not offered here). */
	onQuickAdd?: () => void;
	isAdding?: boolean;
	/** From `describeLength`; its reading time follows the author under the title. */
	lengthLabels?: LengthLabels | null;
};

/**
 * Explore grid card. Matches the visual rhythm of `BookCard` in the library
 * so both grids sit on the same bones on web + mobile.
 */
const ResultCard: React.FC<Props> = ({
	result,
	onOpen,
	isInLibrary,
	onQuickAdd,
	isAdding,
	lengthLabels,
}) => {
	const cover = getCoverUrl(result.id, result.coverUrl);

	return (
		<div
			className="relative w-full self-start"
			data-testid="catalog-card"
			data-in-library={!!isInLibrary}
		>
			<button
				type="button"
				onClick={onOpen}
				className="flex w-full cursor-pointer select-none flex-col border-0 bg-transparent p-0 text-left text-foreground active:opacity-70"
			>
				<div className="relative aspect-2/3 w-full overflow-hidden rounded-sm border border-border bg-muted">
					<CoverImage src={cover} alt={result.title} />
				</div>
				<div className="px-0.5 pt-1">
					{/* A teaser under the cover: the full title is on the book page and in the name. */}
					<div data-clips-text className={CARD_TITLE}>
						{result.title}
					</div>
					<CardMeta author={result.author} labels={lengthLabels} isInLibrary={isInLibrary} />
				</div>
			</button>
			{onQuickAdd && (
				<QuickAddOnCover title={result.title} isAdding={!!isAdding} onAdd={onQuickAdd} />
			)}
		</div>
	);
};

export default ResultCard;
