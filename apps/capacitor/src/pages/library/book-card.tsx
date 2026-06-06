/**
 * BookCard: individual book grid item.
 *
 * Interaction model is shared with SeriesCard via `useLongPress`:
 *   Short tap  (< 400ms) → onOpen  (navigate to reader)
 *   Long press (≥ 400ms) → onMenu  (action sheet: Set active / Delete)
 */

import { Progress } from "@lesefluss/ui/progress";
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
};

const BookCard: React.FC<BookCardProps> = ({ book, cover, progress, started, onOpen, onMenu }) => {
	const handlers = useLongPress({ onTap: onOpen, onMenu });

	return (
		<div
			data-testid="library-card"
			data-book-title={book.title}
			className="flex cursor-pointer select-none flex-col [-webkit-touch-callout:none] active:opacity-70"
			{...handlers}
		>
			<div className="relative aspect-2/3 w-full overflow-hidden rounded-sm">
				<BookCover book={book} cover={cover} size="full" />
				<DeviceBadge bookId={book.id} />
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
				<SyncExcludedBadge book={book} className="mt-1" />
			</div>
		</div>
	);
};

export default BookCard;
