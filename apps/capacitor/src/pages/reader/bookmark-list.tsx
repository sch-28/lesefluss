import { BOOKMARK_LABEL_MAX } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { cn } from "@lesefluss/ui/utils";
import { Pencil, Trash2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { formatShortDate } from "../../utils/date-utils";

export type BookmarkRow = {
	id: string;
	word: number;
	label: string | null;
	createdAt: number;
	chapterTitle: string | null;
	percent: number;
	firstLine: string;
};

interface BookmarkListProps {
	rows: BookmarkRow[];
	/** The row at or before the reading position. */
	currentId: string | null;
	onJump: (word: number) => void;
	onRename: (id: string, label: string) => void;
	onDelete: (id: string) => void;
}

const BookmarkList: React.FC<BookmarkListProps> = ({
	rows,
	currentId,
	onJump,
	onRename,
	onDelete,
}) => {
	const [editingId, setEditingId] = useState<string | null>(null);

	if (rows.length === 0) {
		return (
			<p className="m-0 px-5 py-8 text-center text-muted-foreground text-sm">
				No bookmarks yet. Press B or tap the ribbon to mark this page.
			</p>
		);
	}

	return (
		<ul className="flex flex-col" aria-label="Bookmarks">
			{rows.map((row) => {
				const meta = [row.chapterTitle, `${row.percent}%`, formatShortDate(row.createdAt)]
					.filter(Boolean)
					.join(" · ");
				const isCurrent = row.id === currentId;
				return (
					<li
						key={row.id}
						data-bookmark-word={row.word}
						className={cn(
							"flex items-start gap-1 border-border border-b pr-2",
							isCurrent && "bg-muted/60",
						)}
					>
						{editingId === row.id ? (
							<LabelInput
								initial={row.label ?? ""}
								onDone={(label) => {
									setEditingId(null);
									if (label.trim() !== (row.label ?? "")) onRename(row.id, label);
								}}
							/>
						) : (
							<button
								type="button"
								onClick={() => onJump(row.word)}
								aria-current={isCurrent ? "location" : undefined}
								className="min-w-0 flex-1 px-5 py-3 text-left transition-colors hover:bg-muted"
							>
								<p className="m-0 text-muted-foreground text-xs">{meta}</p>
								{row.label && (
									<p className="m-0 mt-0.5 font-semibold text-foreground text-sm">{row.label}</p>
								)}
								<p className="m-0 mt-0.5 truncate text-foreground text-sm leading-snug">
									{row.firstLine}
								</p>
							</button>
						)}
						{editingId !== row.id && (
							<>
								<Button
									variant="ghost"
									size="icon"
									className="mt-2 shrink-0 text-muted-foreground"
									onClick={() => setEditingId(row.id)}
									aria-label="Rename bookmark"
								>
									<Pencil />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="mt-2 shrink-0 text-muted-foreground"
									onClick={() => onDelete(row.id)}
									aria-label="Delete bookmark"
								>
									<Trash2 />
								</Button>
							</>
						)}
					</li>
				);
			})}
		</ul>
	);
};

/** Enter or leaving the field saves; Escape closes the sheet, dropping the edit. */
function LabelInput({ initial, onDone }: { initial: string; onDone: (label: string) => void }) {
	const [value, setValue] = useState(initial);
	return (
		<input
			// biome-ignore lint/a11y/noAutofocus: opened by the rename button, the field is what the user asked for
			autoFocus
			aria-label="Bookmark label"
			value={value}
			maxLength={BOOKMARK_LABEL_MAX}
			onChange={(e) => setValue(e.target.value)}
			onBlur={() => onDone(value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					e.currentTarget.blur();
				}
			}}
			className="mx-5 my-2 min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
		/>
	);
}

export default BookmarkList;
