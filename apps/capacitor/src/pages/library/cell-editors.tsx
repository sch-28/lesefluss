import {
	BOOK_STATUS_LABELS,
	BOOK_STATUSES,
	type BookStatus,
	nextRating,
	parseBookTags,
	starFill,
} from "@lesefluss/core";
import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { STAR_POSITIONS, StarGlyph } from "@lesefluss/ui/rating-stars";
import { cn } from "@lesefluss/ui/utils";
import { Check, Plus } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BulkAction } from "../../services/db/hooks/use-bulk-books";
import type { Book } from "../../services/db/schema";
import { FIELD_LIMITS } from "./book-fields";
import { tagPatchFor } from "./bulk-tags";
import type { ColumnId } from "./table-columns";

export type EditableColumnId = Extract<ColumnId, "rating" | "status" | "tags">;

export function isEditableColumn(id: ColumnId): id is EditableColumnId {
	return id === "rating" || id === "status" || id === "tags";
}

export type CellEditorProps = {
	columnId: EditableColumnId;
	label: string;
	book: Book;
	text: string;
	align?: "end";
	libraryTags: readonly string[];
	onEdit: (book: Book, action: BulkAction) => void;
	/** A Ctrl, Cmd or Shift click goes here instead of opening the editor, so it selects the row. */
	onModifiedClick: (e: React.MouseEvent) => void;
};

const CELL_CLASS = "min-w-0 truncate px-2 py-2 text-left text-muted-foreground";

/** A rating, status or tags cell: shows its value, and edits it in place on a click. */
export const CellEditor: React.FC<CellEditorProps> = (props) => {
	const { columnId, label, book, text, align } = props;
	const [isOpen, setIsOpen] = useState(false);
	const triggerLabel = `Edit ${label.toLowerCase()} of ${book.title}`;
	const trigger = (
		<button
			type="button"
			aria-label={triggerLabel}
			onClick={(e) => {
				if (e.ctrlKey || e.metaKey || e.shiftKey) {
					// Radix's trigger skips its own toggle on a prevented click.
					e.preventDefault();
					props.onModifiedClick(e);
				} else setIsOpen(true);
			}}
			className={cn(
				CELL_CLASS,
				"h-full w-full cursor-text rounded-sm border-0 bg-transparent hover:bg-muted",
				align === "end" && "text-right tabular-nums",
			)}
		>
			{text}
		</button>
	);

	if (columnId === "rating") {
		return isOpen ? (
			<RatingEditor
				title={book.title}
				rating={book.rating}
				onPick={(rating) => {
					setIsOpen(false);
					if (rating !== book.rating) props.onEdit(book, { kind: "rating", rating });
				}}
				onCancel={() => setIsOpen(false)}
			/>
		) : (
			trigger
		);
	}

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent align="start" className="w-56 p-1">
				{columnId === "status" ? (
					<StatusPicker
						current={book.status}
						onPick={(status) => {
							setIsOpen(false);
							if (status !== book.status) props.onEdit(book, { kind: "status", status });
						}}
					/>
				) : (
					<TagPicker book={book} libraryTags={props.libraryTags} onEdit={props.onEdit} />
				)}
			</PopoverContent>
		</Popover>
	);
};

/** Closes on Esc or a press outside `ref`, the way the popovers do. */
function useDismiss(ref: React.RefObject<HTMLElement | null>, onDismiss: () => void) {
	const dismiss = useRef(onDismiss);
	dismiss.current = onDismiss;
	useEffect(() => {
		const onPointerDown = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node)) dismiss.current();
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			// Taken, so the library's own Esc does not also clear the focus or selection.
			e.preventDefault();
			dismiss.current();
		};
		document.addEventListener("pointerdown", onPointerDown, true);
		document.addEventListener("keydown", onKeyDown, true);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown, true);
			document.removeEventListener("keydown", onKeyDown, true);
		};
	}, [ref]);
}

const RatingEditor: React.FC<{
	title: string;
	rating: number | null;
	onPick: (rating: number | null) => void;
	onCancel: () => void;
}> = ({ title, rating, onPick, onCancel }) => {
	const ref = useRef<HTMLDivElement>(null);
	useDismiss(ref, onCancel);
	useEffect(() => {
		ref.current?.querySelector("button")?.focus();
	}, []);
	return (
		// biome-ignore lint/a11y/useSemanticElements: a star row, not a form fieldset.
		<div
			ref={ref}
			role="group"
			data-inline-editor=""
			aria-label={`Rate ${title}`}
			onKeyDown={(e) => {
				if (e.key === "Delete" || e.key === "Backspace") onPick(null);
			}}
			className="flex items-center justify-end gap-px px-1"
		>
			{STAR_POSITIONS.map((star) => (
				<button
					key={star}
					type="button"
					aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
					onClick={() => onPick(nextRating(rating, star))}
					className="rounded-sm border-0 bg-transparent p-0"
				>
					<StarGlyph fill={starFill(rating, star)} className="size-3" />
				</button>
			))}
		</div>
	);
};

const PICKER_ROW =
	"flex h-8 w-full items-center justify-between gap-2 rounded-md border-0 bg-transparent px-2 text-left text-sm hover:bg-muted";

const StatusPicker: React.FC<{
	current: BookStatus | null;
	onPick: (status: BookStatus | null) => void;
}> = ({ current, onPick }) => (
	<div className="flex flex-col">
		{BOOK_STATUSES.map((status) => (
			<button key={status} type="button" className={PICKER_ROW} onClick={() => onPick(status)}>
				<span className="truncate">{BOOK_STATUS_LABELS[status]}</span>
				{current === status && <Check aria-hidden className="size-4 shrink-0" />}
			</button>
		))}
		<button
			type="button"
			className={cn(PICKER_ROW, "text-muted-foreground")}
			onClick={() => onPick(null)}
		>
			Clear status
		</button>
	</div>
);

/** Enter toggles the tag typed (any case), or creates it; an empty box does nothing. */
export function enterTag(draft: string, options: readonly string[]): string | null {
	if (draft === "") return null;
	const needle = draft.toLowerCase();
	return options.find((t) => t.toLowerCase() === needle) ?? draft;
}

/** Each tap adds or removes one tag and saves it; the picker stays open for the next. */
const TagPicker: React.FC<{
	book: Book;
	libraryTags: readonly string[];
	onEdit: (book: Book, action: BulkAction) => void;
}> = ({ book, libraryTags, onEdit }) => {
	const [tags, setTags] = useState(() => parseBookTags(book.tags));
	const [query, setQuery] = useState("");
	const draft = query.trim();
	const options = useMemo(() => {
		const all = [...new Set([...tags, ...libraryTags])].sort((a, b) => a.localeCompare(b));
		const needle = draft.toLowerCase();
		return needle ? all.filter((t) => t.toLowerCase().includes(needle)) : all;
	}, [tags, libraryTags, draft]);
	const canCreate = draft !== "" && !options.some((t) => t.toLowerCase() === draft.toLowerCase());

	const toggle = (tag: string) => {
		const intent = tags.includes(tag) ? "remove" : "add";
		setTags((current) => (intent === "add" ? [...current, tag] : current.filter((t) => t !== tag)));
		onEdit(book, {
			kind: "tags",
			patch: (fresh) => tagPatchFor(fresh, new Map([[tag, intent]])),
		});
	};

	return (
		<div className="flex flex-col gap-1">
			<input
				// biome-ignore lint/a11y/noAutofocus: the picker opened to type a tag.
				autoFocus
				aria-label="Find or add a tag"
				placeholder="Find or add a tag"
				value={query}
				maxLength={FIELD_LIMITS.tagsJson}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={(e) => {
					if (e.key !== "Enter") return;
					e.preventDefault();
					const tag = enterTag(draft, options);
					if (tag) toggle(tag);
					setQuery("");
				}}
				className="h-8 rounded-md border border-border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			/>
			<div className="flex max-h-60 flex-col overflow-y-auto">
				{options.map((tag) => (
					<button
						key={tag}
						type="button"
						aria-pressed={tags.includes(tag)}
						className={PICKER_ROW}
						onClick={() => toggle(tag)}
					>
						<span className="truncate">{tag}</span>
						{tags.includes(tag) && <Check aria-hidden className="size-4 shrink-0" />}
					</button>
				))}
				{canCreate && (
					<button
						type="button"
						className={cn(PICKER_ROW, "justify-start")}
						onClick={() => {
							toggle(draft);
							setQuery("");
						}}
					>
						<Plus aria-hidden className="size-4 shrink-0" />
						<span className="truncate">New tag “{draft}”</span>
					</button>
				)}
			</div>
		</div>
	);
};
