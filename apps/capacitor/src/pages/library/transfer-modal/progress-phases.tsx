import { IonButton, IonIcon, IonProgressBar } from "@ionic/react";
import { CHUNK_SIZE } from "@rsvp/ble-config";
import { checkmarkCircleOutline } from "ionicons/icons";
import type React from "react";
import BookCover from "../../../components/book-cover";
import type { Book } from "../../../services/db/schema";
import { ESTIMATED_BPS, formatSeconds } from "./utils";

interface TransferringProps {
	book: Book;
	progress: number; // 0–100
	elapsed: number; // seconds
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
					{book.author && <div className="mt-0.5 truncate text-[#888] text-xs">{book.author}</div>}
				</div>
			</div>

			<div className="flex flex-col gap-3">
				<IonProgressBar
					value={progress / 100}
					type={progress === 0 ? "indeterminate" : "determinate"}
					style={
						{
							"--progress-background": "#000",
							"--buffer-background": "#e0e0e0",
						} as React.CSSProperties
					}
				/>
				<div className="flex justify-between text-[#555] text-sm">
					<span>
						Chunk {ackedChunks} / {totalChunks}
					</span>
					<span className="font-medium">{progress}%</span>
				</div>
			</div>

			<div className="flex justify-between text-[#888] text-sm">
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
		<IonIcon icon={checkmarkCircleOutline} style={{ fontSize: "4rem", color: "#2dd36f" }} />
		<div className="text-center">
			<div className="font-semibold text-base">{book.title}</div>
			<div className="mt-1 text-[#888] text-sm">Successfully uploaded to device</div>
		</div>
		<IonButton expand="block" fill="outline" onClick={onClose}>
			Close
		</IonButton>
	</div>
);

interface ErrorProps {
	message: string | null;
	onClose: () => void;
}

export const ErrorPhase: React.FC<ErrorProps> = ({ message, onClose }) => (
	<div className="flex flex-col gap-5 pt-4">
		<div className="rounded-md border border-[#e74c3c] bg-[#fdf3f2] px-4 py-3 text-[#c0392b] text-sm">
			{message ?? "An unknown error occurred."}
		</div>
		<IonButton expand="block" fill="outline" onClick={onClose}>
			Close
		</IonButton>
	</div>
);
