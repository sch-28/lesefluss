import {
	BOOK_STATUS_LABELS,
	BOOK_STATUSES,
	type BookStatus,
	bookStatus,
	nextRating,
	ratingStars,
	starFill,
} from "@lesefluss/core";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { Input } from "@lesefluss/ui/input";
import { Label } from "@lesefluss/ui/label";
import { STAR_POSITIONS, StarGlyph } from "@lesefluss/ui/rating-stars";
import { Switch } from "@lesefluss/ui/switch";
import { cn } from "@lesefluss/ui/utils";
import { Check, ChevronRight, Plus, X } from "lucide-react";
import type React from "react";
import { useState } from "react";
import CoverImage from "../../components/cover-image";
import { LanguagePicker } from "../../components/language-picker";
import type { BookEditValues } from "./book-edit-form";
import { FIELD_LIMITS } from "./book-fields";

export const textareaClass =
	"w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

export type EditForm = {
	values: BookEditValues;
	set: <K extends keyof BookEditValues>(key: K, value: BookEditValues[K]) => void;
	tagDraft: string;
	setTagDraft: (draft: string) => void;
};

type Props = {
	form: EditForm;
	isWide: boolean;
	cover: string | null;
	format: string;
	/** Chips beside the cover: word count, date added, "New". */
	facts: string[];
	fileLanguage?: string | null;
	/** Progress through the book, used to show what an unset status derives to. */
	progress?: { wordCount: number; wordPosition: number };
	/** The series row, which the import page leaves to LESE-125.18. */
	series?: React.ReactNode;
};

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
	<section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
		<h2 className="m-0 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
			{title}
		</h2>
		{children}
	</section>
);

/** Label beside the field on desktop, above it on a phone. */
export const Field: React.FC<{
	label: string;
	htmlFor?: string;
	children: React.ReactNode;
}> = ({ label, htmlFor, children }) => (
	<div className="flex flex-col gap-1.5 md:grid md:grid-cols-[110px_1fr] md:items-start md:gap-3">
		<Label htmlFor={htmlFor} className="md:pt-2">
			{label}
		</Label>
		<div className="min-w-0">{children}</div>
	</div>
);

export const BookEditFields: React.FC<Props> = ({
	form,
	isWide,
	cover,
	format,
	facts,
	fileLanguage,
	progress,
	series,
}) => {
	const { values, set } = form;
	return (
		<div className="flex flex-col gap-4">
			<Card title="Basics">
				<div className="flex gap-4 md:grid md:grid-cols-[150px_1fr] md:gap-6">
					<div className="flex shrink-0 flex-col gap-2">
						<div className="aspect-[2/3] w-[78px] overflow-hidden rounded-md border border-border bg-muted md:w-[150px]">
							<CoverImage
								src={cover}
								alt={values.title}
								className="flex size-full items-center justify-center"
								fallback={
									<span className="font-semibold text-muted-foreground text-xs tracking-wide">
										{format.toUpperCase()}
									</span>
								}
							/>
						</div>
						{isWide && <Facts format={format} facts={facts} />}
					</div>
					{!isWide && (
						<div className="flex min-w-0 flex-col justify-center gap-2">
							<Facts format={format} facts={facts} />
						</div>
					)}
					{isWide && (
						<div className="flex min-w-0 flex-col gap-4">
							<BasicsFields form={form} fileLanguage={fileLanguage} series={series} />
						</div>
					)}
				</div>
				{!isWide && <BasicsFields form={form} fileLanguage={fileLanguage} series={series} />}
			</Card>

			<Card title="Your reading">
				<StatusField
					value={values.status}
					onChange={(s) => set("status", s)}
					isWide={isWide}
					derived={progress ? bookStatus({ ...progress, status: null }) : null}
				/>
				<Field label="Rating">
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
				</Field>
				<TagsField form={form} />
			</Card>

			<Card title="About">
				<Field label="Your notes" htmlFor="book-review">
					<textarea
						id="book-review"
						rows={4}
						maxLength={FIELD_LIMITS.review}
						className={textareaClass}
						value={values.review ?? ""}
						placeholder="Private, only you see these"
						onChange={(e) => set("review", e.target.value || null)}
					/>
				</Field>
			</Card>

			<Card title="Privacy">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<Label htmlFor="book-hide-from-profile">Hide from profile</Label>
						<p className="m-0 text-muted-foreground text-xs">Friends won't see this book</p>
					</div>
					<Switch
						id="book-hide-from-profile"
						checked={values.hideFromProfile}
						onCheckedChange={(v) => set("hideFromProfile", v)}
					/>
				</div>
			</Card>
		</div>
	);
};

const Facts: React.FC<{ format: string; facts: string[] }> = ({ format, facts }) => (
	<div className="flex flex-wrap gap-1.5">
		{[format.toUpperCase(), ...facts].map((fact) => (
			<span key={fact} className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
				{fact}
			</span>
		))}
	</div>
);

const BasicsFields: React.FC<{
	form: EditForm;
	fileLanguage?: string | null;
	series?: React.ReactNode;
}> = ({ form: { values, set }, fileLanguage, series }) => (
	<>
		<Field label="Title" htmlFor="book-title">
			<Input
				id="book-title"
				maxLength={FIELD_LIMITS.title}
				value={values.title}
				onChange={(e) => set("title", e.target.value)}
			/>
		</Field>
		<Field label="Author" htmlFor="book-author">
			<Input
				id="book-author"
				maxLength={FIELD_LIMITS.author}
				value={values.author ?? ""}
				onChange={(e) => set("author", e.target.value || null)}
			/>
		</Field>
		<Field label="Language" htmlFor="book-language">
			<LanguagePicker
				id="book-language"
				value={values.language}
				fileLanguage={fileLanguage}
				onChange={(code) => set("language", code)}
			/>
		</Field>
		{series}
		<Field label="Description" htmlFor="book-description">
			<textarea
				id="book-description"
				rows={4}
				maxLength={FIELD_LIMITS.description}
				className={textareaClass}
				value={values.description ?? ""}
				onChange={(e) => set("description", e.target.value || null)}
			/>
		</Field>
	</>
);

const StatusField: React.FC<{
	value: BookStatus | null;
	onChange: (status: BookStatus | null) => void;
	isWide: boolean;
	derived: BookStatus | null;
}> = ({ value, onChange, isWide, derived }) => {
	const [open, setOpen] = useState(false);
	const automatic = derived
		? `Automatic (${BOOK_STATUS_LABELS[derived].toLowerCase()})`
		: "Automatic (from progress)";
	const choices: { status: BookStatus | null; label: string }[] = [
		{ status: null, label: isWide ? "Automatic" : automatic },
		...BOOK_STATUSES.map((s) => ({ status: s, label: BOOK_STATUS_LABELS[s] })),
	];

	if (isWide) {
		return (
			<Field label="Status">
				<div className="flex flex-wrap gap-2">
					{choices.map((c) => (
						<button
							key={c.label}
							type="button"
							aria-pressed={value === c.status}
							onClick={() => onChange(c.status)}
							className={cn(
								"rounded-full border px-3 py-1 text-sm transition-colors",
								value === c.status
									? "border-primary bg-primary text-primary-foreground"
									: "border-input text-muted-foreground hover:bg-muted",
							)}
						>
							{c.label}
						</button>
					))}
				</div>
				{value === null && derived && (
					<p className="m-0 mt-1.5 text-muted-foreground text-xs">
						Following your reading: {BOOK_STATUS_LABELS[derived]}.
					</p>
				)}
			</Field>
		);
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex items-center justify-between gap-3 text-left"
			>
				<span className="font-medium text-sm">Status</span>
				<span className="flex items-center gap-1 text-muted-foreground text-sm">
					{value ? BOOK_STATUS_LABELS[value] : automatic}
					<ChevronRight className="size-4" />
				</span>
			</button>
			<Drawer open={open} onOpenChange={setOpen}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Status</DrawerTitle>
					</DrawerHeader>
					<div className="flex flex-col p-2 pb-4">
						{choices.map((c) => (
							<button
								key={c.label}
								type="button"
								onClick={() => {
									onChange(c.status);
									setOpen(false);
								}}
								className="flex h-12 items-center gap-3 rounded-md px-3 text-left text-base hover:bg-muted"
							>
								<span className="flex-1">{c.label}</span>
								{value === c.status && <Check className="size-4 text-primary" />}
							</button>
						))}
					</div>
				</DrawerContent>
			</Drawer>
		</>
	);
};

const TagsField: React.FC<{ form: EditForm }> = ({
	form: { values, set, tagDraft, setTagDraft },
}) => {
	const commitTag = () => {
		const label = tagDraft.trim();
		if (label && !values.tags.includes(label)) set("tags", [...values.tags, label]);
		setTagDraft("");
	};
	return (
		<Field label="Tags" htmlFor="book-tags">
			<div className="flex flex-wrap items-center gap-2">
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
				<div className="flex min-w-32 flex-1 items-center gap-1">
					<Plus className="size-4 shrink-0 text-muted-foreground" />
					<Input
						id="book-tags"
						value={tagDraft}
						placeholder="Add tag"
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
			</div>
		</Field>
	);
};
