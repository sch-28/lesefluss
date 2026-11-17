import type React from "react";
import CoverImage from "../../components/cover-image";
import { providerLabel, type SearchResult } from "../../services/serial-scrapers";
import { CardMeta, QuickAddOnCover } from "./card-badges";
import { describeLength } from "./length";
import ProviderCover from "./provider-cover";
import { useReadingSpeed } from "./use-reading-speed";
import { useWebNovelImport } from "./use-web-novel-import";
import { chapterFallback, webNovelLength } from "./web-novel-facts";

/**
 * Vertical card mirroring `pages/explore/result-card.tsx` rhythm: aspect-2/3
 * cover, 2-line title, the author and length line, and the provider where asked.
 */
export const WebNovelCard: React.FC<{
	result: SearchResult;
	onPick: (result: SearchResult) => void;
	/** Name the provider under the title; off where the surrounding heading already does. */
	showProvider: boolean;
}> = ({ result, onPick, showProvider }) => {
	const quickAdd = useWebNovelImport(result.sourceUrl);
	const canQuickAdd = quickAdd.isMembershipKnown && !quickAdd.isInLibrary;
	const { wpm } = useReadingSpeed();
	const lengthLabels = describeLength(webNovelLength(result.details), wpm);
	const chapters = chapterFallback(result);
	return (
		<div
			className="relative w-full self-start"
			data-testid="web-novel-card"
			data-in-library={quickAdd.isInLibrary}
		>
			<button
				type="button"
				onClick={() => onPick(result)}
				className="flex w-full cursor-pointer select-none flex-col border-0 bg-transparent p-0 text-left text-foreground active:opacity-70"
			>
				<div className="relative aspect-2/3 w-full overflow-hidden rounded-md border border-border bg-muted">
					<CoverImage
						src={result.coverImage}
						alt={result.title}
						fallback={<ProviderCover result={result} />}
					/>
				</div>
				<div className="px-0.5 pt-1">
					{/* A teaser under the cover: the full title is on the book page and in the name. */}
					<div
						data-clips-text
						className="overflow-hidden text-ellipsis font-semibold text-[0.85rem] leading-[1.2] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]"
					>
						{result.title}
					</div>
					<CardMeta
						author={result.author}
						labels={lengthLabels}
						lengthFallback={chapters}
						isInLibrary={quickAdd.isInLibrary}
					/>
					{showProvider && (
						<div className="mt-0.5 text-[0.7rem] text-muted-foreground">
							{providerLabel(result.provider)}
						</div>
					)}
				</div>
			</button>
			{canQuickAdd && (
				<QuickAddOnCover
					title={result.title}
					isAdding={quickAdd.isImporting}
					onAdd={() => quickAdd.start(result.title)}
				/>
			)}
		</div>
	);
};

/** The lines a web novel card has beyond a catalog card's, for `CardSkeleton`'s `extraLines`. */
export const webNovelCardExtraLines = (showProvider: boolean) => (showProvider ? 1 : 0);
