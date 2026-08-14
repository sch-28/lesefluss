import {
	BOOK_STATUS_LABELS,
	BOOK_STATUSES,
	type BookStatus,
	bookStatus,
	nextRating,
	parseBookTags,
	ratingStars,
	serializeBookTags,
	starFill,
} from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import { Input } from "@lesefluss/ui/input";
import { Label } from "@lesefluss/ui/label";
import { STAR_POSITIONS, StarGlyph } from "@lesefluss/ui/rating-stars";
import { X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { clampBookTags, FIELD_LIMITS } from "./book-fields";

/**
 * The editable half of a book. Deliberately not a `Book`: the import confirm
 * flow edits a payload that has no database row yet, and a reading position is
 * not something this sheet touches.
 */
export type BookEditValues = {
	title: string;
	author: string | null;
	description: string | null;
	language: string | null;
	status: BookStatus | null;
	rating: number | null;
	review: string | null;
	tags: string[];
};

type Props = {
	isOpen: boolean;
	onClose: () => void;
	initial: BookEditValues;
	onSave: (values: BookEditValues) => void;
	title?: string;
	saveLabel?: string;
	isSaving?: boolean;
	/** Progress through the book, used to show what an unset status derives to. */
	progress?: { wordCount: number; wordPosition: number };
};

/** Reader-editable values clamped to what sync will accept. */
export function clampToFieldLimits(values: BookEditValues): BookEditValues {
	const cap = (text: string | null, max: number) => (text ? text.slice(0, max) : text);
	const { tags } = clampBookTags(values.tags);
	return {
		...values,
		title: values.title.slice(0, FIELD_LIMITS.title),
		author: cap(values.author, FIELD_LIMITS.author),
		description: cap(values.description, FIELD_LIMITS.description),
		review: cap(values.review, FIELD_LIMITS.review),
		language: cap(values.language, FIELD_LIMITS.language),
		tags,
	};
}

/** `Book` row to the sheet's value shape. */
export function bookToEditValues(book: {
	title: string;
	author: string | null;
	description: string | null;
	language: string | null;
	status: BookStatus | null;
	rating: number | null;
	review: string | null;
	tags: string | null;
}): BookEditValues {
	return {
		title: book.title,
		author: book.author,
		description: book.description,
		language: book.language,
		status: book.status,
		rating: book.rating,
		review: book.review,
		tags: parseBookTags(book.tags),
	};
}

/** The sheet's value shape as a `updateBook` patch. */
export function editValuesToPatch(values: BookEditValues) {
	const clamped = clampToFieldLimits(values);
	return { ...clamped, tags: serializeBookTags(clamped.tags) };
}

const textareaClass =
	"w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

const BookEditSheet: React.FC<Props> = ({
	isOpen,
	onClose,
	initial,
	onSave,
	title = "Edit book",
	saveLabel = "Save",
	isSaving = false,
	progress,
}) => {
	const [values, setValues] = useState(initial);
	const [tagDraft, setTagDraft] = useState("");

	// Reopening on a different book has to start from that book, not from
	// whatever the last edit left behind.
	useEffect(() => {
		if (isOpen) {
			setValues(initial);
			setTagDraft("");
		}
	}, [isOpen, initial]);

	const set = <K extends keyof BookEditValues>(key: K, value: BookEditValues[K]) =>
		setValues((v) => ({ ...v, [key]: value }));

	const commitTag = () => {
		const label = tagDraft.trim();
		if (!label || values.tags.includes(label)) {
			setTagDraft("");
			return;
		}
		set("tags", [...values.tags, label]);
		setTagDraft("");
	};

	const derivedStatus = progress ? bookStatus({ ...progress, status: null }) : null;

	return (
		<Drawer
			open={isOpen}
			// Swipe-to-dismiss is disabled rather than ignored while saving: vaul
			// leaves the drag transform in place when the close is vetoed by the
			// consumer, stranding the sheet off-screen with no spring-back.
			dismissible={!isSaving}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>{title}</DrawerTitle>
				</DrawerHeader>

				<div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-4 pb-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="book-title">Title</Label>
						<Input
							id="book-title"
							maxLength={FIELD_LIMITS.title}
							value={values.title}
							onChange={(e) => set("title", e.target.value)}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="book-author">Author</Label>
						<Input
							id="book-author"
							maxLength={FIELD_LIMITS.author}
							value={values.author ?? ""}
							onChange={(e) => set("author", e.target.value || null)}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="book-status">Status</Label>
						<div className="flex flex-wrap gap-2">
							{BOOK_STATUSES.map((s) => (
								<button
									key={s}
									type="button"
									onClick={() => set("status", s)}
									className={`rounded-full border px-3 py-1 text-sm transition-colors ${
										values.status === s
											? "border-primary bg-primary text-primary-foreground"
											: "border-input text-muted-foreground hover:bg-muted"
									}`}
								>
									{BOOK_STATUS_LABELS[s]}
								</button>
							))}
						</div>
						{values.status === null ? (
							<p className="m-0 text-muted-foreground text-xs">
								{derivedStatus
									? `Following your reading: ${BOOK_STATUS_LABELS[derivedStatus]}.`
									: "Follows your reading progress."}
							</p>
						) : (
							<button
								type="button"
								onClick={() => set("status", null)}
								className="w-fit text-primary text-xs underline underline-offset-4"
							>
								Reset to automatic
							</button>
						)}
					</div>

					<div className="flex flex-col gap-1.5">
						<Label>Rating</Label>
						<div className="flex items-center gap-1">
							{STAR_POSITIONS.map((star) => (
								<button
									key={star}
									type="button"
									aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
									onClick={() => set("rating", nextRating(values.rating, star))}
									className="p-0.5"
								>
									<StarGlyph fill={starFill(values.rating, star)} className="size-6" />
								</button>
							))}
							{values.rating !== null && (
								<>
									<span className="ml-2 text-muted-foreground text-xs">
										{ratingStars(values.rating)}
									</span>
									<button
										type="button"
										onClick={() => set("rating", null)}
										className="ml-2 text-primary text-xs underline underline-offset-4"
									>
										Clear
									</button>
								</>
							)}
						</div>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="book-tags">Tags</Label>
						{values.tags.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{values.tags.map((tag) => (
									<span
										key={tag}
										className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-sm"
									>
										{tag}
										<button
											type="button"
											aria-label={`Remove ${tag}`}
											onClick={() =>
												set(
													"tags",
													values.tags.filter((t) => t !== tag),
												)
											}
										>
											<X className="size-3.5 text-muted-foreground" />
										</button>
									</span>
								))}
							</div>
						)}
						<Input
							id="book-tags"
							value={tagDraft}
							placeholder="Add a tag"
							onChange={(e) => setTagDraft(e.target.value)}
							onBlur={commitTag}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === ",") {
									e.preventDefault();
									commitTag();
								}
							}}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="book-description">Description</Label>
						<textarea
							id="book-description"
							rows={3}
							maxLength={FIELD_LIMITS.description}
							className={textareaClass}
							value={values.description ?? ""}
							onChange={(e) => set("description", e.target.value || null)}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="book-review">Your notes</Label>
						<textarea
							id="book-review"
							rows={3}
							maxLength={FIELD_LIMITS.review}
							className={textareaClass}
							value={values.review ?? ""}
							onChange={(e) => set("review", e.target.value || null)}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="book-language">Language</Label>
						<Input
							id="book-language"
							maxLength={FIELD_LIMITS.language}
							value={values.language ?? ""}
							placeholder="en, de, fr"
							onChange={(e) => set("language", e.target.value.trim() || null)}
						/>
					</div>
				</div>

				<DrawerFooter className="flex-row gap-2">
					<Button variant="outline" className="flex-1" onClick={onClose} disabled={isSaving}>
						Cancel
					</Button>
					<Button
						className="flex-1"
						disabled={isSaving || values.title.trim().length === 0}
						onClick={() => {
							// A pending tag the reader typed but never committed would
							// otherwise be lost on save.
							const label = tagDraft.trim();
							const tags =
								label && !values.tags.includes(label) ? [...values.tags, label] : values.tags;
							onSave({ ...values, title: values.title.trim(), tags });
						}}
					>
						{saveLabel}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
};

export default BookEditSheet;
