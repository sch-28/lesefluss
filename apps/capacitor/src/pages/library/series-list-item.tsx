import type React from "react";
import { useId } from "react";
import CoverImage from "../../components/cover-image";
import { TintedCover } from "../../components/tinted-cover";
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
	/** The book cards' fields; a serial fills author and time left, the others take no line. */
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
			className="flex min-h-16 w-full cursor-pointer select-none items-center gap-3 rounded-sm border-0 border-border border-b bg-transparent py-1 text-left text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:opacity-70"
			style={{ WebkitTouchCallout: "none" }}
			{...handlers}
		>
			<div className="relative h-15 w-10 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
				<CoverImage
					src={series.coverImage}
					alt={series.title}
					fallback={<TintedCover title={series.title} compact />}
				/>
			</div>

			<div className="min-w-0 flex-1">
				<div className="truncate font-medium text-sm leading-5">{series.title}</div>
				<div id={detailsId}>
					{fields.map((field) =>
						field === "progress" ? null : (
							<CardFieldSlot key={field} surface="list" field={field}>
								{field === "author" && series.author && <TextField text={series.author} />}
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
						<div className="mt-0.5 text-muted-foreground text-xs">
							{chapterCountLabel(chapterCount)}
						</div>
					)}
				</div>
			</div>
		</button>
	);
};

export default SeriesListItem;
