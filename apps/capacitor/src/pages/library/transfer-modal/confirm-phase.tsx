import { IonButton } from "@ionic/react";
import type React from "react";
import BookCover from "../../../components/book-cover";
import type { Book } from "../../../services/db/schema";
import { DEVICE_TOTAL_BYTES, ESTIMATED_BPS, formatBytes, formatSeconds } from "./utils";

interface Props {
	book: Book;
	activeBook: Book | null;
	onUpload: () => void;
}

const ConfirmPhase: React.FC<Props> = ({ book, activeBook, onUpload }) => {
	const estimatedFree = DEVICE_TOTAL_BYTES - book.size;
	const willFit = book.size <= DEVICE_TOTAL_BYTES;
	const replacingBook = activeBook != null && activeBook.id !== book.id;

	return (
		<div className="flex flex-col gap-5 pt-2">
			{/* Cover + book info */}
			<div className="flex gap-4">
				<BookCover book={book} size="md" />
				<div className="flex min-w-0 flex-col justify-center gap-1">
					<div className="line-clamp-3 font-semibold text-base leading-snug">{book.title}</div>
					{book.author && <div className="truncate text-[#888] text-sm">{book.author}</div>}
					<div className="mt-1 text-sm">
						<span className="text-[#888]">Size: </span>
						<span className="font-medium">{formatBytes(book.size)}</span>
					</div>
					<div className="text-sm">
						<span className="text-[#888]">Est. time: </span>
						<span className="font-medium">~{formatSeconds(book.size / ESTIMATED_BPS)}</span>
					</div>
				</div>
			</div>

			{/* Free space estimate */}
			<div className="rounded-md bg-[#f5f5f5] px-4 py-3 text-sm">
				<div className="font-medium text-[#555]">Free on device after transfer</div>
				<div className={`mt-1 font-semibold ${willFit ? "text-black" : "text-[#c0392b]"}`}>
					~{formatBytes(estimatedFree)}
					<span className="ml-1 font-normal text-[#888] text-xs">
						/ {formatBytes(DEVICE_TOTAL_BYTES)} total
					</span>
				</div>
			</div>

			{/* Too large warning */}
			{!willFit && (
				<div className="rounded-md border border-[#e74c3c] bg-[#fdf3f2] px-4 py-3 text-[#c0392b] text-sm">
					Book is too large for the device ({formatBytes(book.size)} &gt;{" "}
					{formatBytes(DEVICE_TOTAL_BYTES)}).
				</div>
			)}

			{/* Replacement warning */}
			{replacingBook && (
				<div className="rounded-md border border-[#e0a800] bg-[#fffbf0] px-4 py-3 text-[#7d5a00] text-sm">
					<span className="font-semibold">"{activeBook!.title}"</span> is currently on the device
					and will be removed.
				</div>
			)}

			<IonButton expand="block" disabled={!willFit} onClick={onUpload}>
				Upload
			</IonButton>
		</div>
	);
};

export default ConfirmPhase;
