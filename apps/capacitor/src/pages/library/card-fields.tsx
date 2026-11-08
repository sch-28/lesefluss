import { bookStatus } from "@lesefluss/core";
import { Progress } from "@lesefluss/ui/progress";
import { RatingStars } from "@lesefluss/ui/rating-stars";
import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { useMemo } from "react";
import { usePersistentString } from "../../hooks/use-persistent-string";
import { formatReadingTime } from "../../utils/reading-time";
import type { LibraryItem } from "./sort-filter";
import { type CellContext, type ColumnId, TABLE_COLUMNS } from "./table-columns";

/** Card fields are table columns too: one id, label and value per field. */
export type CardFieldId = Extract<
	ColumnId,
	| "author"
	| "series"
	| "status"
	| "progress"
	| "timeLeft"
	| "rating"
	| "tags"
	| "words"
	| "lastRead"
>;

export type CardSurface = "grid" | "list";
export type CardFieldSettings = Record<CardSurface, CardFieldId[]>;

const CARD_FIELD_IDS: readonly CardFieldId[] = [
	"progress",
	"author",
	"series",
	"rating",
	"status",
	"timeLeft",
	"tags",
	"words",
	"lastRead",
];

const COLUMN_LABELS = new Map(TABLE_COLUMNS.map((c) => [c.id, c.label]));
export const CARD_FIELDS: readonly { id: CardFieldId; label: string }[] = CARD_FIELD_IDS.map(
	(id) => ({ id, label: COLUMN_LABELS.get(id) ?? id }),
);

/** What the cards showed before fields could be picked, plus time left (serial cards had it). */
export const DEFAULT_CARD_FIELDS: CardFieldSettings = {
	grid: ["progress", "author", "rating", "timeLeft"],
	list: ["progress", "author", "rating", "timeLeft"],
};

export const CARD_FIELDS_KEY = "lesefluss:library-card-fields";

const isCardField = (id: unknown): id is CardFieldId =>
	typeof id === "string" && (CARD_FIELD_IDS as readonly string[]).includes(id);

/** Unknown ids are dropped; a surface that cannot be read keeps its default. */
export function parseCardFields(raw: string | null): CardFieldSettings {
	let parsed: unknown;
	try {
		parsed = raw === null ? null : JSON.parse(raw);
	} catch {
		parsed = null;
	}
	const stored =
		typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
	const surface = (key: CardSurface) => {
		const ids = stored[key];
		return Array.isArray(ids)
			? orderFields(ids.filter(isCardField))
			: [...DEFAULT_CARD_FIELDS[key]];
	};
	return { grid: surface("grid"), list: surface("list") };
}

/** Registry order, so a card reads the same whichever order the boxes were ticked in. */
function orderFields(ids: readonly CardFieldId[]): CardFieldId[] {
	return CARD_FIELD_IDS.filter((id) => ids.includes(id));
}

export function toggleCardField(ids: readonly CardFieldId[], id: CardFieldId): CardFieldId[] {
	return ids.includes(id) ? ids.filter((f) => f !== id) : orderFields([...ids, id]);
}

const isAnyString = (value: string): value is string => typeof value === "string";

/** This device's card fields per surface; view settings are per device, never synced. */
export function useCardFields() {
	const [raw, setRaw] = usePersistentString(
		CARD_FIELDS_KEY,
		isAnyString,
		JSON.stringify(DEFAULT_CARD_FIELDS),
	);
	const settings = useMemo(() => parseCardFields(raw), [raw]);
	const toggle = (surface: CardSurface, id: CardFieldId) =>
		setRaw((current) => {
			const next = parseCardFields(current);
			return JSON.stringify({ ...next, [surface]: toggleCardField(next[surface], id) });
		});
	return { settings, toggle };
}

/** Time left only while a book is under way: unstarted and finished books show none. */
export function cardTimeLeft(item: LibraryItem): string {
	if (item.kind !== "book" || item.sortKey.progress <= 0 || item.sortKey.minutesLeft === null) {
		return "";
	}
	return `Left ${formatReadingTime(item.sortKey.minutesLeft)}`;
}

export type CardFieldValues = Partial<Record<CardFieldId, string>>;

const TEXT_FIELDS = new Map(TABLE_COLUMNS.map((c) => [c.id, c]));

/** Each text field's value for one item, from the table's own cell text. */
export function cardFieldValues(
	item: LibraryItem,
	ctx: CellContext,
	fields: readonly CardFieldId[],
): CardFieldValues {
	const values: CardFieldValues = {};
	for (const id of fields) {
		if (id === "progress" || id === "rating") continue;
		values[id] =
			id === "timeLeft" ? cardTimeLeft(item) : (TEXT_FIELDS.get(id)?.text(item, ctx) ?? "");
	}
	return values;
}

const SLOT = {
	grid: "h-4 text-[0.75rem] leading-4",
	list: "h-[1.125rem] text-[0.8rem] leading-[1.125rem]",
};

/**
 * One fixed-height line per field, an empty one too, so cards with and without a
 * value stay the same height and the virtualized rows stay aligned.
 */
export const CardFieldSlot: React.FC<{
	surface: CardSurface;
	field: CardFieldId;
	children?: React.ReactNode;
	className?: string;
}> = ({ surface, field, children, className }) => (
	<div
		data-card-field={field}
		className={cn("mt-0.5 flex min-w-0 items-center", SLOT[surface], className)}
	>
		{children}
	</div>
);

/** A Reading book shows its progress bar even while the percent still rounds to 0. */
export function hasStarted(book: Parameters<typeof bookStatus>[0]): boolean {
	return bookStatus(book) !== "want";
}

export const ProgressField: React.FC<{ progress: number; id?: string }> = ({ progress, id }) => (
	<span id={id} className="flex flex-1 items-center gap-1.5">
		<Progress value={progress} className="h-1 flex-1" aria-label="Reading progress" />
		<span className="font-medium text-[0.7rem] text-muted-foreground tabular-nums">
			{progress}%
		</span>
	</span>
);

/** An empty slot's quiet stand-in, so a card shows what is missing rather than a blank line. */
const PLACEHOLDER = "truncate text-muted-foreground/50";

export const RatingField: React.FC<{ rating: number | null }> = ({ rating }) =>
	rating === null ? (
		<span role="img" aria-label="Not rated" className="opacity-50">
			<RatingStars rating={0} starClassName="size-3" aria-hidden />
		</span>
	) : (
		<RatingStars rating={rating} starClassName="size-3" />
	);

export const NotStartedField: React.FC = () => (
	<span className={cn(PLACEHOLDER, "text-[0.7rem]")}>Not started</span>
);

export const TextField: React.FC<{ text: string | undefined }> = ({ text }) =>
	text ? (
		<span className="truncate text-muted-foreground tabular-nums">{text}</span>
	) : (
		<span aria-hidden className={PLACEHOLDER}>
			–
		</span>
	);
