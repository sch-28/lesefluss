import type React from "react";
import { useId } from "react";
import CoverImage from "../../components/cover-image";
import type { Series } from "../../services/db/schema";
import { chapterCountLabel } from "../../services/serial-scrapers";
import type { SeriesChapterLength } from "../../services/stats/what-if";
import { type CardFieldId, CardFieldSlot, DEFAULT_CARD_FIELDS, TextField } from "./card-fields";
import { SeriesCardTime } from "./series-reading-time";
import { useLongPress } from "./use-long-press";

interface SeriesListItemProps {
	series: Series;
	chapterCount: number | undefined;
	chapterLengths: readonly SeriesChapterLength[] | undefined;
	onOpen: () => void;
	onMenu: () => void;
	/** The book cards' fields; a serial fills author and time left, and keeps the others' lines empty. */
	fields?: readonly CardFieldId[];
}

const SeriesListItem: React.FC<SeriesListItemProps> = ({
	series,
	chapterCount,
	chapterLengths,
	onOpen,
	onMenu,
	fields = DEFAULT_CARD_FIELDS.list,
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
				<div className="line-clamp-2 overflow-hidden font-semibold text-[0.9rem] leading-[1.2]">
					{series.title}
				</div>
				<div id={detailsId}>
					{fields.map((field) =>
						field === "progress" ? null : (
							<CardFieldSlot key={field} surface="list" field={field}>
								{field === "author" && <TextField text={series.author ?? ""} />}
								{field === "timeLeft" && (
									<SeriesCardTime
										chapters={chapterLengths}
										className="truncate text-muted-foreground tabular-nums"
									/>
								)}
							</CardFieldSlot>
						),
					)}
					{chapterCount !== undefined && (
						<div className="mt-0.5 text-[0.75rem] text-muted-foreground">
							{chapterCountLabel(chapterCount)}
						</div>
					)}
					{fields.includes("progress") && (
						<CardFieldSlot surface="list" field="progress" className="mt-1" />
					)}
				</div>
			</div>
		</button>
	);
};

export default SeriesListItem;
