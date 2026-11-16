/**
 * BookCard: individual book grid item.
 *
 * Tap opens (or toggles while selecting), Shift / Ctrl / Cmd-click and a long
 * press select, right-click and the … button open the per-book menu.
 */

import { Check } from "lucide-react";
import type React from "react";
import { useId } from "react";
import BookCover from "../../components/book-cover";
import { formatSeriesNumber } from "../../components/collections/series-numbering";
import { DeviceBadge } from "../../components/device-sync";
import type { Book } from "../../services/db/schema";
import {
	BookFieldLines,
	type CardFieldId,
	type CardFieldValues,
	type CardStatus,
	DEFAULT_CARD_FIELDS,
} from "./card-fields";
import CardMoreButton from "./card-more-button";
import { SyncExcludedBadge } from "./sync-excluded-badge";
import { useLongPress } from "./use-long-press";

type BookCardProps = {
	book: Book;
	cover: string | undefined;
	status: CardStatus;
	onOpen: () => void;
	onMenu: () => void;
	/** Selection mode is active: a tap picks this book instead of opening it. */
	selectable?: boolean;
	selected?: boolean;
	onToggle?: () => void;
	/** A click with Shift, Ctrl or Cmd held: range and toggle selection. */
	onModifiedClick?: (e: React.MouseEvent) => void;
	/** Starts selection; without it a long press opens the menu. */
	onLongPress?: () => void;
	/** Mouse drag onto a sidebar collection; the library's grid sets the drag data. */
	draggable?: boolean;
	/** The book's #N in its series, from the series collection. */
	seriesNumber?: number | null;
	/** The card fields picked for the grid, and their text values. */
	fields?: readonly CardFieldId[];
	values?: CardFieldValues;
};

const BookCard: React.FC<BookCardProps> = ({
	book,
	cover,
	status,
	onOpen,
	onMenu,
	selectable = false,
	selected = false,
	onToggle,
	onModifiedClick,
	onLongPress,
	draggable = false,
	seriesNumber = null,
	fields = DEFAULT_CARD_FIELDS.grid,
	values,
}) => {
	const handlers = useLongPress({
		onTap: (e) => {
			if (onModifiedClick && (e.shiftKey || e.ctrlKey || e.metaKey)) onModifiedClick(e);
			else (selectable ? (onToggle ?? onOpen) : onOpen)();
		},
		onMenu: () => {
			if (!selectable) onMenu();
		},
		onLongPress,
		enabled: !!onLongPress || !selectable,
	});
	const id = useId();
	const detailsId = `${id}-details`;
	const deviceId = `${id}-device`;
	const seriesId = `${id}-series`;

	return (
		<div className="group relative">
			<button
				type="button"
				data-book-id={book.id}
				draggable={draggable}
				data-testid="library-card"
				data-book-title={book.title}
				data-selected={selectable && selected ? "true" : undefined}
				aria-label={book.title}
				aria-describedby={[seriesNumber !== null && seriesId, deviceId, detailsId]
					.filter(Boolean)
					.join(" ")}
				aria-pressed={selectable ? selected : undefined}
				className="flex w-full cursor-pointer select-none flex-col rounded-sm border-0 bg-transparent p-0 text-left text-foreground outline-none [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-70"
				{...handlers}
			>
				<div className="relative aspect-2/3 w-full overflow-hidden rounded-sm">
					<BookCover book={book} cover={cover} size="full" />
					<span id={deviceId}>
						<DeviceBadge bookId={book.id} />
					</span>
					{seriesNumber !== null && (
						<span
							id={seriesId}
							data-testid="series-number-badge"
							className="absolute bottom-1.5 left-1.5 rounded-sm bg-background/85 px-1 font-semibold text-[0.7rem] text-foreground tabular-nums"
						>
							{formatSeriesNumber(seriesNumber)}
						</span>
					)}
					{selectable && (
						<>
							{!selected && <div className="absolute inset-0 bg-background/60" />}
							<span
								className={`absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full border ${
									selected
										? "border-primary bg-primary text-primary-foreground"
										: "border-border bg-background/80"
								}`}
							>
								{selected && <Check className="size-3.5" />}
							</span>
						</>
					)}
				</div>

				<div className="px-0.5 pt-2">
					<div className="line-clamp-2 overflow-hidden font-medium text-[0.875rem] leading-[1.25]">
						{book.title}
					</div>
					<div id={detailsId}>
						<BookFieldLines
							surface="grid"
							fields={fields}
							book={book}
							status={status}
							values={values}
						/>
						<SyncExcludedBadge book={book} className="mt-1" />
					</div>
				</div>
			</button>
			{!selectable && (
				<CardMoreButton title={book.title} onMenu={onMenu} className="absolute top-1.5 right-1.5" />
			)}
		</div>
	);
};

export default BookCard;
