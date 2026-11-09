/**
 * SeriesCard — library grid item for an imported web-novel/serial.
 *
 * Interaction model is identical to BookCard (both use `useLongPress`):
 *   Short tap  → onOpen  (navigate to last-read or chapter 0)
 *   Long press → onMenu  (action sheet: Delete)
 *
 * `chapterCount` is passed in from the page-level batched query rather than
 * fetched per-card to avoid N+1 round trips on library mount.
 */

import type React from "react";
import { useId } from "react";
import CoverImage from "../../components/cover-image";
import type { Series } from "../../services/db/schema";
import { chapterCountLabel } from "../../services/serial-scrapers";
import type { SeriesChapterLength } from "../../services/stats/what-if";
import { type CardFieldId, CardFieldSlot, DEFAULT_CARD_FIELDS } from "./card-fields";
import { SeriesCardTime } from "./series-reading-time";
import { useLongPress } from "./use-long-press";

interface SeriesCardProps {
	series: Series;
	chapterCount: number | undefined;
	chapterLengths: readonly SeriesChapterLength[] | undefined;
	onOpen: () => void;
	onMenu: () => void;
	/** The book cards' fields; a serial fills author and time left, the others take no line. */
	fields?: readonly CardFieldId[];
}

const SeriesCard: React.FC<SeriesCardProps> = ({
	series,
	chapterCount,
	chapterLengths,
	onOpen,
	onMenu,
	fields = DEFAULT_CARD_FIELDS.grid,
}) => {
	const handlers = useLongPress({ onTap: onOpen, onMenu });
	const id = useId();
	const chaptersId = `${id}-chapters`;
	const authorId = `${id}-author`;
	const timeId = `${id}-time`;

	return (
		<button
			type="button"
			aria-label={series.title}
			aria-describedby={`${chaptersId} ${authorId} ${timeId}`}
			className="flex w-full select-none flex-col rounded-sm border-0 bg-transparent p-0 text-left text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-70"
			style={{ WebkitTouchCallout: "none", cursor: "pointer" }}
			{...handlers}
		>
			{/* Cover */}
			<div className="relative aspect-2/3 w-full overflow-hidden rounded-sm border border-border bg-muted">
				<CoverImage
					src={series.coverImage}
					alt={series.title}
					fallback={
						<span className="font-semibold text-[0.6rem] text-muted-foreground uppercase tracking-wide">
							{series.provider}
						</span>
					}
				/>
				{/* Chapter-count badge */}
				{chapterCount !== undefined && (
					<span
						id={chaptersId}
						className="absolute right-1.5 bottom-1.5 rounded-sm bg-black px-1.5 py-0.5 font-semibold text-[0.6rem] text-white"
					>
						{chapterCountLabel(chapterCount, { short: true })}
					</span>
				)}
			</div>

			<div className="px-0.5 pt-2">
				<div className="line-clamp-2 overflow-hidden font-medium text-[0.875rem] leading-[1.25]">
					{series.title}
				</div>
				{fields.map((field) =>
					field === "progress" ? null : (
						<CardFieldSlot key={field} surface="grid" field={field}>
							{field === "author" && series.author && (
								<span id={authorId} className="truncate text-muted-foreground">
									{series.author}
								</span>
							)}
							{field === "timeLeft" && (
								<SeriesCardTime
									id={timeId}
									chapters={chapterLengths}
									className="truncate text-muted-foreground tabular-nums"
								/>
							)}
						</CardFieldSlot>
					),
				)}
			</div>
		</button>
	);
};

export default SeriesCard;
