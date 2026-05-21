import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import BookCover from "../../../components/book-cover";
import type { Book } from "../../../services/db/schema";
import type { DeviceCategory } from "../../../services/devices/hash";
import { DEVICE_TOTAL_BYTES, ESTIMATED_BPS, formatBytes, formatSeconds } from "./utils";

type Props = {
	book: Book;
	activeBook: Book | null;
	isMultiBook: boolean;
	category: DeviceCategory;
	onCategoryChange: (next: DeviceCategory) => void;
	onUpload: () => void;
};

const ConfirmPhase: React.FC<Props> = ({
	book,
	activeBook,
	isMultiBook,
	category,
	onCategoryChange,
	onUpload,
}) => {
	const estimatedFree = DEVICE_TOTAL_BYTES - book.size;
	// Multi-book devices have ample SD storage. Only single-book devices have
	// the ~3MB flash limit that the fit check guards against.
	const willFit = isMultiBook || book.size <= DEVICE_TOTAL_BYTES;
	const replacingBook = !isMultiBook && activeBook != null && activeBook.id !== book.id;

	return (
		<div className="flex flex-col gap-5 pt-2">
			<div className="flex gap-4">
				<BookCover book={book} size="md" />
				<div className="flex min-w-0 flex-col justify-center gap-1">
					<div className="line-clamp-3 font-semibold text-base leading-snug">{book.title}</div>
					{book.author && (
						<div className="truncate text-muted-foreground text-sm">{book.author}</div>
					)}
					<div className="mt-1 text-sm">
						<span className="text-muted-foreground">Size: </span>
						<span className="font-medium">{formatBytes(book.size)}</span>
					</div>
					<div className="text-sm">
						<span className="text-muted-foreground">Est. time: </span>
						<span className="font-medium">~{formatSeconds(book.size / ESTIMATED_BPS)}</span>
					</div>
				</div>
			</div>

			{!isMultiBook && (
				<div className="rounded-md bg-muted px-4 py-3 text-sm">
					<div className="font-medium text-muted-foreground">Free on device after transfer</div>
					<div
						className={cn("mt-1 font-semibold", willFit ? "text-foreground" : "text-destructive")}
					>
						~{formatBytes(estimatedFree)}
						<span className="ml-1 font-normal text-muted-foreground text-xs">
							/ {formatBytes(DEVICE_TOTAL_BYTES)} total
						</span>
					</div>
				</div>
			)}

			{isMultiBook && (
				<fieldset className="flex flex-col gap-2 rounded-md bg-muted px-4 py-3 text-sm">
					<legend className="font-medium text-muted-foreground">Send as</legend>
					<label className="flex cursor-pointer items-center gap-2">
						<input
							type="radio"
							name="upload-category"
							value="book"
							checked={category === "book"}
							onChange={() => onCategoryChange("book")}
						/>
						<span>Book</span>
					</label>
					<label className="flex cursor-pointer items-center gap-2">
						<input
							type="radio"
							name="upload-category"
							value="article"
							checked={category === "article"}
							onChange={() => onCategoryChange("article")}
						/>
						<span>Article</span>
					</label>
				</fieldset>
			)}

			{!isMultiBook && !willFit && (
				<div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive text-sm">
					Book is too large for the device ({formatBytes(book.size)} &gt;{" "}
					{formatBytes(DEVICE_TOTAL_BYTES)}).
				</div>
			)}

			{replacingBook && (
				<div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-900 text-sm dark:text-amber-200">
					<span className="font-semibold">"{activeBook?.title}"</span> is currently on the device
					and will be removed.
				</div>
			)}

			<Button className="w-full" disabled={!willFit} onClick={onUpload}>
				Upload
			</Button>
		</div>
	);
};

export default ConfirmPhase;
