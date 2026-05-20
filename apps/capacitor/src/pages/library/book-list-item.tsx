import { Progress } from "@lesefluss/ui/progress";
import type React from "react";
import BookCover from "../../components/book-cover";
import type { Book } from "../../services/db/schema";
import { useLongPress } from "./use-long-press";

interface BookListItemProps {
	book: Book;
	cover: string | undefined;
	progress: number;
	started: boolean;
	isActive: boolean;
	onOpen: () => void;
	onMenu: () => void;
}

const BookListItem: React.FC<BookListItemProps> = ({
	book,
	cover,
	progress,
	started,
	isActive,
	onOpen,
	onMenu,
}) => {
	const handlers = useLongPress({ onTap: onOpen, onMenu });

	return (
		<div
			className="flex cursor-pointer select-none items-center gap-3 [-webkit-touch-callout:none] active:opacity-70"
			{...handlers}
		>
			<div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-sm">
				<BookCover book={book} cover={cover} size="full" />
			</div>

			<div className="min-w-0 flex-1">
				<div className="line-clamp-2 overflow-hidden font-semibold text-[0.9rem] leading-[1.2]">
					{book.title}
				</div>
				{book.author && (
					<div className="mt-0.5 truncate text-[0.8rem] text-muted-foreground">
						{book.author}
					</div>
				)}
				{started && (
					<div className="mt-1 flex items-center gap-1.5">
						<Progress value={progress} className="h-1 flex-1" />
						<span className="font-medium text-[0.7rem] text-muted-foreground tabular-nums">
							{progress}%
						</span>
					</div>
				)}
				{isActive && (
					<div className="mt-0.5 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-wide">
						On device
					</div>
				)}
			</div>
		</div>
	);
};

export default BookListItem;
