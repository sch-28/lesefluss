import { Progress } from "@lesefluss/ui/progress";
import { RatingStars } from "@lesefluss/ui/rating-stars";
import { Check } from "lucide-react";
import type React from "react";
import BookCover from "../../components/book-cover";
import { DeviceBadge } from "../../components/device-sync";
import type { Book } from "../../services/db/schema";
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
}) => {
	const handlers = useLongPress({
		onTap: selectable ? (onToggle ?? onOpen) : onOpen,
		onMenu,
		enabled: !selectable,
	});

	return (
		<div
			data-book-title={book.title}
			data-selected={selectable && selected ? "true" : undefined}
			className="flex cursor-pointer select-none items-center gap-3 [-webkit-touch-callout:none] active:opacity-70"
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
				{book.author && (
					<div className="mt-0.5 truncate text-[0.8rem] text-muted-foreground">{book.author}</div>
				)}
				{book.rating !== null && (
					<RatingStars rating={book.rating} className="mt-0.5" starClassName="size-3" />
				)}
				{started && (
					<div className="mt-1 flex items-center gap-1.5">
						<Progress value={progress} className="h-1 flex-1" />
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
	);
};

export default BookListItem;
