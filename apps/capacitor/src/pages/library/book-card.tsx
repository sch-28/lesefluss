/**
 * BookCard — individual book grid item.
 *
 * Interaction model:
 *   Short tap  (< 400ms) → onOpen  (navigate to reader)
 *   Long press (≥ 400ms) → onMenu  (action sheet: Set active / Delete)
 *
 * Long press also calls e.preventDefault() to suppress the browser context
 * menu on desktop / long-press context menus on some Android WebViews.
 * onTouchMove cancels the timer so scrolling the grid never triggers onMenu.
 */

import { IonProgressBar } from "@ionic/react";
import type React from "react";
import { useCallback, useRef } from "react";
import BookCover from "../../components/book-cover";
import type { Book } from "../../services/db/schema";

const LONG_PRESS_MS = 400;

interface BookCardProps {
	book: Book;
	cover: string | undefined;
	progress: number;
	started: boolean;
	isActive: boolean;
	onOpen: () => void;
	onMenu: () => void;
}

const BookCard: React.FC<BookCardProps> = ({
	book,
	cover,
	progress,
	started,
	isActive,
	onOpen,
	onMenu,
}) => {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const firedRef = useRef(false);

	const handleTouchStart = useCallback(
		(e: React.TouchEvent) => {
			if (e.touches.length !== 1) return;
			firedRef.current = false;
			timerRef.current = setTimeout(() => {
				firedRef.current = true;
				e.preventDefault();
				onMenu();
			}, LONG_PRESS_MS);
		},
		[onMenu],
	);

	const cancelTimer = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const handleTouchEnd = useCallback(() => {
		cancelTimer();
		if (!firedRef.current) {
			onOpen();
		}
	}, [cancelTimer, onOpen]);

	return (
		<div
			className="flex select-none flex-col active:opacity-70"
			style={{ WebkitTouchCallout: "none", cursor: "pointer" }}
			onTouchStart={handleTouchStart}
			onTouchEnd={handleTouchEnd}
			onTouchMove={cancelTimer}
		>
			{/* Cover */}
			<div className="relative aspect-2/3 w-full overflow-hidden rounded-sm">
				<BookCover book={book} cover={cover} size="full" />

				{/* "On device" badge overlay */}
				{isActive && (
					<span className="absolute right-1.5 bottom-1.5 rounded-sm bg-black px-1.5 py-0.5 font-semibold text-[0.6rem] text-white">
						On device
					</span>
				)}
			</div>

			{/* Progress bar */}
			{started && (
				<div className="mt-1 flex items-center gap-1.5">
					<div className="flex-1 [--buffer-background:#e0e0e0] [--progress-background:#000]">
						<IonProgressBar value={progress / 100} />
					</div>
					<span className="font-medium text-[#888] text-[0.7rem]">{progress}%</span>
				</div>
			)}

			{/* Title / author */}
			<div className="px-0.5 pt-1">
				<div className="overflow-hidden text-ellipsis font-semibold text-[0.85rem] leading-[1.2] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [display:-webkit-box]">
					{book.title}
				</div>
				{book.author && (
					<div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[#888] text-[0.75rem]">
						{book.author}
					</div>
				)}
			</div>
		</div>
	);
};

export default BookCard;
