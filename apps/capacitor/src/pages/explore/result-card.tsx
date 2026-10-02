import type React from "react";
import CoverImage from "../../components/cover-image";
import type { CatalogSearchResult } from "../../services/catalog/client";
import { getCoverUrl } from "../../services/catalog/client";
import { InLibraryBadge, QuickAddOverlay } from "./card-badges";

type Props = {
	result: CatalogSearchResult;
	onOpen: () => void;
	isInLibrary?: boolean;
	/** Omit to hide quick add (in library, no EPUB, or not offered here). */
	onQuickAdd?: () => void;
	isAdding?: boolean;
	/** e.g. "2h 10m" at the reader's speed; omitted until the catalog has counted the book. */
	readingTime?: string | null;
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
	readingTime,
}) => {
	const cover = getCoverUrl(result.id, result.coverUrl);
	const isSE = result.source === "standard_ebooks";

	return (
		<div className="relative w-full" data-testid="catalog-card" data-in-library={!!isInLibrary}>
			<button
				type="button"
				onClick={onOpen}
				className="flex w-full cursor-pointer select-none flex-col border-0 bg-transparent p-0 text-left text-foreground active:opacity-70"
			>
				<div className="relative aspect-2/3 w-full overflow-hidden rounded-sm border border-border bg-muted">
					<CoverImage src={cover} alt={result.title} />
					{isSE && (
						<span className="absolute top-1.5 right-1.5 rounded-sm bg-foreground px-1.5 py-0.5 font-semibold text-[0.6rem] text-background">
							SE
						</span>
					)}
					{isInLibrary && <InLibraryBadge className="absolute bottom-1.5 left-1.5" />}
				</div>
				<div className="px-0.5 pt-1">
					<div className="overflow-hidden text-ellipsis font-semibold text-[0.85rem] leading-[1.2] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">
						{result.title}
					</div>
					{result.author && (
						<div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[0.75rem] text-muted-foreground">
							{result.author}
						</div>
					)}
					{readingTime && (
						<div className="mt-0.5 text-[0.7rem] text-muted-foreground">{readingTime}</div>
					)}
				</div>
			</button>
			{onQuickAdd && (
				<QuickAddOverlay title={result.title} isAdding={!!isAdding} onAdd={onQuickAdd} />
			)}
		</div>
	);
};

export default ResultCard;
