/**
 * BookCover
 *
 * Displays a book's cover image (lazy-loaded from the DB) or a fallback
 * showing the file format. Used in the library grid and the transfer modal.
 */

import type React from "react";
import { queryHooks } from "../services/db/hooks";
import type { Book } from "../services/db/schema";

interface Props {
	book: Book;
	/** "sm" = 3.5×5.25rem  |  "md" = 5.5×8.25rem  |  "full" = fills parent (use with a sized container) */
	size?: "sm" | "md" | "full";
	/** Optionally pass a pre-loaded cover string to skip the cache lookup. */
	cover?: string | null;
}

const DIMS: Record<"sm" | "md", React.CSSProperties> = {
	sm: { width: "3.5rem", minWidth: "3.5rem", height: "5.25rem" },
	md: { width: "5.5rem", minWidth: "5.5rem", height: "8.25rem" },
};

const BookCover: React.FC<Props> = ({ book, size = "md", cover: coverProp }) => {
	// When no cover prop is passed, read from the useBooks() cache.
	// The Library page already fetched this, so it's a zero-cost cache read.
	const { data } = queryHooks.useBooks();
	const cover = coverProp ?? data?.covers.get(book.id) ?? null;

	const style = size === "full" ? undefined : DIMS[size];
	const className = [
		"flex items-center justify-center overflow-hidden rounded-sm border border-[#d9d9d9] bg-[#f0f0f0]",
		size === "full" ? "w-full h-full" : "",
	]
		.join(" ")
		.trim();

	return (
		<div className={className} style={style}>
			{cover ? (
				<img src={cover} alt={book.title} className="block h-full w-full object-cover" />
			) : (
				<span className="font-semibold text-[#bbb] text-[0.6rem] tracking-wide">
					{book.fileFormat.toUpperCase()}
				</span>
			)}
		</div>
	);
};

export default BookCover;
