import type React from "react";
import CoverImage from "../../components/cover-image";
import { chapterCountLabel, type SearchResult } from "../../services/serial-scrapers";
import { InLibraryBadge, QuickAddOverlay } from "./card-badges";
import TextCover from "./text-cover";
import { useWebNovelImport } from "./use-web-novel-import";

/**
 * Vertical card mirroring `pages/explore/result-card.tsx` rhythm.
 * Aspect-2/3 cover, provider chip top-right, 2-line title + author below.
 */
export const WebNovelCard: React.FC<{
	result: SearchResult;
	onPick: (result: SearchResult) => void;
}> = ({ result, onPick }) => {
	const quickAdd = useWebNovelImport(result.sourceUrl);
	const canQuickAdd = quickAdd.isMembershipKnown && !quickAdd.isInLibrary;
	return (
		<div
			className="relative w-full"
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
						fallback={<TextCover result={result} />}
					/>
					<span className="absolute top-1.5 right-1.5 rounded-sm bg-foreground px-1.5 py-0.5 font-semibold text-[0.6rem] text-background uppercase tracking-wide">
						{result.provider}
					</span>
					{quickAdd.isInLibrary && <InLibraryBadge className="absolute bottom-1.5 left-1.5" />}
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
					{result.chapterCount != null && (
						<div className="mt-0.5 text-[0.7rem] text-muted-foreground">
							{chapterCountLabel(result.chapterCount)}
						</div>
					)}
				</div>
			</button>
			{canQuickAdd && (
				<QuickAddOverlay
					title={result.title}
					isAdding={quickAdd.isImporting}
					onAdd={() => quickAdd.start(result.title)}
				/>
			)}
		</div>
	);
};
