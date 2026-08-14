/**
 * BookCard: individual book grid item.
 *
 * Interaction model is shared with SeriesCard via `useLongPress`:
 *   Short tap  (< 400ms) → onOpen  (navigate to reader)
 *   Long press (≥ 400ms) → onMenu  (action sheet: Set active / Delete)
 */

import { Progress } from "@lesefluss/ui/progress";
import { RatingStars } from "@lesefluss/ui/rating-stars";
import { Check } from "lucide-react";
import type React from "react";
import BookCover from "../../components/book-cover";
import { DeviceBadge } from "../../components/device-sync";
import type { Book } from "../../services/db/schema";
import { SyncExcludedBadge } from "./sync-excluded-badge";
import { useLongPress } from "./use-long-press";

type BookCardProps = {
	book: Book;
	cover: string | undefined;
	progress: number;
	started: boolean;
	onOpen: () => void;
	onMenu: () => void;
	/** Selection mode is active: a tap picks this book instead of opening it. */
	selectable?: boolean;
	selected?: boolean;
	onToggle?: () => void;
};

const BookCard: React.FC<BookCardProps> = ({
	book,
	cover,
	progress,
	started,
	onOpen,
	onMenu,
	selectable = false,
	selected = false,
	onToggle,
}) => {
	const handlers = useLongPress({
		onTap: selectable ? (onToggle ?? onOpen) : onOpen,
		onMenu,
		enabled: !selectable,
	});

	return (
		<div
			data-testid="library-card"
			data-book-title={book.title}
			data-selected={selectable && selected ? "true" : undefined}
			className="flex cursor-pointer select-none flex-col [-webkit-touch-callout:none] active:opacity-70"
			{...handlers}
		>
			<div className="relative aspect-2/3 w-full overflow-hidden rounded-sm">
				<BookCover book={book} cover={cover} size="full" />
				<DeviceBadge bookId={book.id} />
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

			{started && (
				<div className="mt-1 flex items-center gap-1.5">
					<Progress value={progress} className="h-1 flex-1" />
					<span className="font-medium text-[0.7rem] text-muted-foreground tabular-nums">
						{progress}%
					</span>
				</div>
			)}

			<div className="px-0.5 pt-1">
				<div className="line-clamp-2 overflow-hidden font-semibold text-[0.85rem] leading-[1.2]">
					{book.title}
				</div>
				{book.author && (
					<div className="mt-0.5 truncate text-[0.75rem] text-muted-foreground">{book.author}</div>
				)}
				{/* Sorting by rating is offered from the same screen, so the value has to
				    be visible here or the reorder looks like nothing happened. */}
				{book.rating !== null && (
					<RatingStars rating={book.rating} className="mt-0.5" starClassName="size-3" />
				)}
				<SyncExcludedBadge book={book} className="mt-1" />
			</div>
		</div>
	);
};

export default BookCard;
