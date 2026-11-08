import { displayAuthor } from "@lesefluss/core";
import { Check } from "lucide-react";
import type React from "react";
import { useId } from "react";
import BookCover from "../../components/book-cover";
import { formatSeriesNumber } from "../../components/collections/series-numbering";
import { DeviceBadge } from "../../components/device-sync";
import type { Book } from "../../services/db/schema";
import {
	type CardFieldId,
	CardFieldSlot,
	type CardFieldValues,
	DEFAULT_CARD_FIELDS,
	NotStartedField,
	ProgressField,
	RatingField,
	TextField,
} from "./card-fields";
import CardMoreButton from "./card-more-button";
import { SyncExcludedBadge } from "./sync-excluded-badge";
import { useLongPress } from "./use-long-press";

type BookListItemProps = {
	book: Book;
	cover: string | undefined;
	progress: number;
	started: boolean;
	onOpen: () => void;
	onMenu: () => void;
	/** Selection mode is active: a tap picks this book instead of opening it. */
	selectable?: boolean;
	selected?: boolean;
	onToggle?: () => void;
	/** A click with Shift, Ctrl or Cmd held: range and toggle selection. */
	onModifiedClick?: (e: React.MouseEvent) => void;
	/** Starts selection; without it a long press opens the menu. */
	onLongPress?: () => void;
	/** Mouse drag onto a sidebar collection; the library's grid sets the drag data. */
	draggable?: boolean;
	/** The book's #N in its series, from the series collection. */
	seriesNumber?: number | null;
	/** The card fields picked for the list, and their text values. */
	fields?: readonly CardFieldId[];
	values?: CardFieldValues;
};

const BookListItem: React.FC<BookListItemProps> = ({
	book,
	cover,
	progress,
	started,
	onOpen,
	onMenu,
	selectable = false,
	selected = false,
	onToggle,
	onModifiedClick,
	onLongPress,
	draggable = false,
	seriesNumber = null,
	fields = DEFAULT_CARD_FIELDS.list,
	values,
}) => {
	const handlers = useLongPress({
		onTap: (e) => {
			if (onModifiedClick && (e.shiftKey || e.ctrlKey || e.metaKey)) onModifiedClick(e);
			else (selectable ? (onToggle ?? onOpen) : onOpen)();
		},
		onMenu: () => {
			if (!selectable) onMenu();
		},
		onLongPress,
		enabled: !!onLongPress || !selectable,
	});
	const detailsId = useId();
	const showsAuthor = fields.includes("author");
	const badge =
		seriesNumber === null ? null : (
			<span data-testid="series-number-badge" className="font-semibold tabular-nums">
				{formatSeriesNumber(seriesNumber)}
			</span>
		);

	return (
		<div className="group relative flex items-center gap-2">
			<button
				type="button"
				data-book-id={book.id}
				draggable={draggable}
				data-book-title={book.title}
				data-selected={selectable && selected ? "true" : undefined}
				aria-label={book.title}
				aria-describedby={detailsId}
				aria-pressed={selectable ? selected : undefined}
				className="flex min-w-0 flex-1 cursor-pointer select-none items-center gap-3 rounded-sm border-0 bg-transparent p-0 text-left text-foreground outline-none [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-70"
				{...handlers}
			>
				{/* Leading pip rather than the grid's scrim: a wash over a thumbnail this
			    small reads as a rendering fault. */}
				{selectable && (
					<span
						className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
							selected
								? "border-primary bg-primary text-primary-foreground"
								: "border-border bg-background"
						}`}
					>
						{selected && <Check className="size-3.5" />}
					</span>
				)}
				<div className="relative h-16 w-12 shrink-0 overflow-hidden rounded-sm">
					<BookCover book={book} cover={cover} size="full" />
				</div>

				<div className="min-w-0 flex-1">
					<div className="line-clamp-2 overflow-hidden font-semibold text-[0.9rem] leading-[1.2]">
						{badge && !showsAuthor && <>{badge} </>}
						{book.title}
					</div>
					<div id={detailsId}>
						{fields.map((field) => {
							if (field === "progress") return null;
							if (field === "rating") {
								return (
									<CardFieldSlot key={field} surface="list" field={field}>
										<RatingField rating={book.rating} />
									</CardFieldSlot>
								);
							}
							const text =
								values?.[field] ?? (field === "author" ? displayAuthor(book.author ?? "") : "");
							return (
								<CardFieldSlot key={field} surface="list" field={field}>
									{field === "author" && badge ? (
										<span className="truncate text-muted-foreground">
											{badge}
											{text && ` · ${text}`}
										</span>
									) : (
										<TextField text={text} />
									)}
								</CardFieldSlot>
							);
						})}
						{fields.includes("progress") && (
							<CardFieldSlot surface="list" field="progress" className="mt-1">
								{started ? <ProgressField progress={progress} /> : <NotStartedField />}
							</CardFieldSlot>
						)}
						<div className="mt-1 flex flex-wrap items-center gap-1.5">
							<DeviceBadge bookId={book.id} style="block" />
							<SyncExcludedBadge book={book} />
						</div>
					</div>
				</div>
			</button>
			{!selectable && <CardMoreButton title={book.title} onMenu={onMenu} className="shrink-0" />}
		</div>
	);
};

export default BookListItem;
