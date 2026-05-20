import { CHUNK_SIZE } from "@lesefluss/ble-config";
import { Button } from "@lesefluss/ui/button";
import { Progress } from "@lesefluss/ui/progress";
import { CheckCircle2 } from "lucide-react";
import type React from "react";
import BookCover from "../../../components/book-cover";
import type { Book } from "../../../services/db/schema";
import { ESTIMATED_BPS, formatSeconds } from "./utils";

interface TransferringProps {
	book: Book;
	progress: number;
	elapsed: number;
}

export const TransferringPhase: React.FC<TransferringProps> = ({ book, progress, elapsed }) => {
	const totalChunks = Math.ceil(book.size / CHUNK_SIZE);
	const ackedChunks = Math.round((progress / 100) * totalChunks);

	let timeRemainingStr = "";
	if (progress > 5 && elapsed > 0) {
		const bytesPerSec = ((progress / 100) * book.size) / elapsed;
		const remainingBytes = ((100 - progress) / 100) * book.size;
		timeRemainingStr = formatSeconds(remainingBytes / bytesPerSec);
	} else {
		timeRemainingStr = formatSeconds((((100 - progress) / 100) * book.size) / ESTIMATED_BPS);
	}

	return (
		<div className="flex flex-col gap-6 pt-4">
			<div className="flex items-center gap-4">
				<BookCover book={book} size="sm" />
				<div className="min-w-0">
					<div className="line-clamp-2 font-semibold text-sm leading-snug">{book.title}</div>
					{book.author && (
						<div className="mt-0.5 truncate text-muted-foreground text-xs">{book.author}</div>
					)}
				</div>
			</div>

			<div className="flex flex-col gap-3">
				<Progress value={progress} className="h-1.5" />
				<div className="flex justify-between text-muted-foreground text-sm">
					<span>
						Chunk {ackedChunks} / {totalChunks}
					</span>
					<span className="font-medium text-foreground">{progress}%</span>
				</div>
			</div>

			<div className="flex justify-between text-muted-foreground text-sm">
				<span>Elapsed: {formatSeconds(elapsed)}</span>
				{timeRemainingStr && <span>~{timeRemainingStr} remaining</span>}
			</div>
		</div>
	);
};

interface DoneProps {
	book: Book;
	onClose: () => void;
}

export const DonePhase: React.FC<DoneProps> = ({ book, onClose }) => (
	<div className="flex flex-col items-center gap-6 py-8">
		<CheckCircle2 className="size-16 text-green-500" />
		<div className="text-center">
			<div className="font-semibold text-base">{book.title}</div>
			<div className="mt-1 text-muted-foreground text-sm">Successfully uploaded to device</div>
		</div>
		<Button variant="outline" className="w-full" onClick={onClose}>
			Close
		</Button>
	</div>
);

interface ErrorProps {
	message: string | null;
	onClose: () => void;
}

export const ErrorPhase: React.FC<ErrorProps> = ({ message, onClose }) => (
	<div className="flex flex-col gap-5 pt-4">
		<div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive text-sm">
			{message ?? "An unknown error occurred."}
		</div>
		<Button variant="outline" className="w-full" onClick={onClose}>
			Close
		</Button>
	</div>
);
