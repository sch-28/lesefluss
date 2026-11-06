/**
 * BookCard: individual book grid item.
 *
 * Tap opens (or toggles while selecting), Shift / Ctrl / Cmd-click and a long
 * press select, right-click and the … button open the per-book menu.
 */

import { Progress } from "@lesefluss/ui/progress";
import { RatingStars } from "@lesefluss/ui/rating-stars";
import { Check } from "lucide-react";
import type React from "react";
import { useId } from "react";
import BookCover from "../../components/book-cover";
import { DeviceBadge } from "../../components/device-sync";
import type { Book } from "../../services/db/schema";
import CardMoreButton from "./card-more-button";
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
	/** A click with Shift, Ctrl or Cmd held: range and toggle selection. */
	onModifiedClick?: (e: React.MouseEvent) => void;
	/** Starts selection; without it a long press opens the menu. */
	onLongPress?: () => void;
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
	onModifiedClick,
	onLongPress,
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
	const progressId = `${id}-progress`;
	const detailsId = `${id}-details`;
	const deviceId = `${id}-device`;

	return (
		<div className="group relative">
			<button
				type="button"
				data-book-id={book.id}
				data-testid="library-card"
				data-book-title={book.title}
				data-selected={selectable && selected ? "true" : undefined}
				aria-label={book.title}
				aria-describedby={[deviceId, started && progressId, detailsId].filter(Boolean).join(" ")}
				aria-pressed={selectable ? selected : undefined}
				className="flex w-full cursor-pointer select-none flex-col rounded-sm border-0 bg-transparent p-0 text-left text-foreground outline-none [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-70"
				{...handlers}
			>
				<div className="relative aspect-2/3 w-full overflow-hidden rounded-sm">
					<BookCover book={book} cover={cover} size="full" />
					<span id={deviceId}>
						<DeviceBadge bookId={book.id} />
					</span>
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
					<div id={progressId} className="mt-1 flex items-center gap-1.5">
						<Progress value={progress} className="h-1 flex-1" aria-label="Reading progress" />
						<span className="font-medium text-[0.7rem] text-muted-foreground tabular-nums">
							{progress}%
						</span>
					</div>
				)}

				<div className="px-0.5 pt-1">
					<div className="line-clamp-2 overflow-hidden font-semibold text-[0.85rem] leading-[1.2]">
						{book.title}
					</div>
					<div id={detailsId}>
						{book.author && (
							<div className="mt-0.5 truncate text-[0.75rem] text-muted-foreground">
								{book.author}
							</div>
						)}
						{/* Sorting by rating is offered from the same screen, so the value has to
					    be visible here or the reorder looks like nothing happened. */}
						{book.rating !== null && (
							<RatingStars rating={book.rating} className="mt-0.5" starClassName="size-3" />
						)}
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
