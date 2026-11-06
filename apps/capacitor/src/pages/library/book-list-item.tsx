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

type BookListItemProps = {
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

const BookListItem: React.FC<BookListItemProps> = ({
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
	const detailsId = useId();

	return (
		<div className="group relative flex items-center gap-2">
			<button
				type="button"
				data-book-id={book.id}
				data-book-title={book.title}
				data-selected={selectable && selected ? "true" : undefined}
				aria-label={book.title}
				aria-describedby={detailsId}
				aria-pressed={selectable ? selected : undefined}
				className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-3 rounded-sm border-0 bg-transparent p-0 text-left text-foreground outline-none [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-70"
				{...handlers}
			>
				{/* Leading pip rather than the grid's scrim: a wash over a thumbnail this
			    small reads as a rendering fault. */}
				{selectable && (
					<span
						className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
							selected
								? "border-primary bg-primary text-primary-foreground"
								: "border-border bg-background"
						}`}
					>
						{selected && <Check className="size-3.5" />}
					</span>
				)}
				<div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-sm">
					<BookCover book={book} cover={cover} size="full" />
				</div>

				<div className="min-w-0 flex-1">
					<div className="line-clamp-2 overflow-hidden font-semibold text-[0.9rem] leading-[1.2]">
						{book.title}
					</div>
					<div id={detailsId}>
						{book.author && (
							<div className="mt-0.5 truncate text-[0.8rem] text-muted-foreground">
								{book.author}
							</div>
						)}
						{book.rating !== null && (
							<RatingStars rating={book.rating} className="mt-0.5" starClassName="size-3" />
						)}
						{started && (
							<div className="mt-1 flex items-center gap-1.5">
								<Progress value={progress} className="h-1 flex-1" aria-label="Reading progress" />
								<span className="font-medium text-[0.7rem] text-muted-foreground tabular-nums">
									{progress}%
								</span>
							</div>
						)}
						<div className="mt-1 flex flex-wrap items-center gap-1.5">
							<DeviceBadge bookId={book.id} style="block" />
							<SyncExcludedBadge book={book} />
						</div>
					</div>
				</div>
			</button>
			{!selectable && <CardMoreButton title={book.title} onMenu={onMenu} className="shrink-0" />}
		</div>
	);
};

export default BookListItem;
