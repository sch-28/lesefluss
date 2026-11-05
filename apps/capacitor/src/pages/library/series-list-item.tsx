import type React from "react";
import { useId } from "react";
import CoverImage from "../../components/cover-image";
import type { Series } from "../../services/db/schema";
import { chapterCountLabel } from "../../services/serial-scrapers";
import { useLongPress } from "./use-long-press";

interface SeriesListItemProps {
	series: Series;
	chapterCount: number | undefined;
	onOpen: () => void;
	onMenu: () => void;
}

const SeriesListItem: React.FC<SeriesListItemProps> = ({
	series,
	chapterCount,
	onOpen,
	onMenu,
}) => {
	const handlers = useLongPress({ onTap: onOpen, onMenu });
	const detailsId = useId();

	return (
		<button
			type="button"
			aria-label={series.title}
			aria-describedby={detailsId}
			className="flex w-full cursor-pointer select-none items-center gap-3 rounded-sm border-0 bg-transparent p-0 text-left text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-70"
			style={{ WebkitTouchCallout: "none" }}
			{...handlers}
		>
			<div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-sm border border-[#d9d9d9] bg-[#f0f0f0]">
				<CoverImage
					src={series.coverImage}
					alt={series.title}
					fallback={
						<span className="font-semibold text-[#bbb] text-[0.6rem] uppercase tracking-wide">
							{series.provider}
						</span>
					}
				/>
			</div>

			<div className="min-w-0 flex-1">
				<div className="overflow-hidden text-ellipsis font-semibold text-[0.9rem] leading-[1.2] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">
					{series.title}
				</div>
				<div id={detailsId}>
					{series.author && (
						<div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[#888] text-[0.8rem]">
							{series.author}
						</div>
					)}
					{chapterCount !== undefined && (
						<div className="mt-0.5 text-[#888] text-[0.75rem]">
							{chapterCountLabel(chapterCount)}
						</div>
					)}
				</div>
			</div>
		</button>
	);
};

export default SeriesListItem;
