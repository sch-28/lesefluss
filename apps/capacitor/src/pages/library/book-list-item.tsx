import { IonProgressBar } from "@ionic/react";
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
			className="flex cursor-pointer select-none items-center gap-3 active:opacity-70"
			style={{ WebkitTouchCallout: "none" }}
			{...handlers}
		>
			<div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-sm">
				<BookCover book={book} cover={cover} size="full" />
			</div>

			<div className="min-w-0 flex-1">
				<div className="overflow-hidden text-ellipsis font-semibold text-[0.9rem] leading-[1.2] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">
					{book.title}
				</div>
				{book.author && (
					<div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[#888] text-[0.8rem]">
						{book.author}
					</div>
				)}
				{started && (
					<div className="mt-1 flex items-center gap-1.5">
						<div className="flex-1 [--buffer-background:#e0e0e0] [--progress-background:#000]">
							<IonProgressBar value={progress / 100} />
						</div>
						<span className="font-medium text-[#888] text-[0.7rem]">{progress}%</span>
					</div>
				)}
				{isActive && (
					<div className="mt-0.5 font-semibold text-[0.7rem] text-[#888] uppercase tracking-wide">
						On device
					</div>
				)}
			</div>
		</div>
	);
};

export default BookListItem;
