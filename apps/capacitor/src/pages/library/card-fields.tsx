import { bookStatus, displayAuthor, readingProgress } from "@lesefluss/core";
import { Progress } from "@lesefluss/ui/progress";
import { RatingStars } from "@lesefluss/ui/rating-stars";
import { cn } from "@lesefluss/ui/utils";
import { Check, Clock } from "lucide-react";
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

/** Also the order a card shows them in: the status line comes last, under the text. */
const CARD_FIELD_IDS: readonly CardFieldId[] = [
	"author",
	"series",
	"rating",
	"status",
	"timeLeft",
	"tags",
	"words",
	"lastRead",
	"progress",
];

const COLUMN_LABELS = new Map(TABLE_COLUMNS.map((c) => [c.id, c.label]));
export const CARD_FIELDS: readonly { id: CardFieldId; label: string }[] = CARD_FIELD_IDS.map(
	(id) => ({ id, label: COLUMN_LABELS.get(id) ?? id }),
);

/** Title, author and the status line (decision 183c96c2 on LESE-190.6); the rest is opt-in. */
export const DEFAULT_CARD_FIELDS: CardFieldSettings = {
	grid: ["author", "progress"],
	list: ["author", "progress"],
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
	grid: "mt-0.5 h-4 text-[0.75rem] leading-4",
	list: "mt-0.5 h-4 text-[0.75rem] leading-4",
};

/** One line per field that has a value; an empty one (a child that renders nothing) takes no line. */
export const CardFieldSlot: React.FC<{
	surface: CardSurface;
	field: CardFieldId;
	children?: React.ReactNode;
	className?: string;
}> = ({ surface, field, children, className }) => (
	<div
		data-card-field={field}
		className={cn("flex min-w-0 items-center empty:hidden", SLOT[surface], className)}
	>
		{children}
	</div>
);

/** A Reading book shows its progress bar even while the percent still rounds to 0. */
export function hasStarted(book: Parameters<typeof bookStatus>[0]): boolean {
	return bookStatus(book) !== "want";
}

/** What a card's status line says: progress, finished, or how long the book takes to read. */
export type CardStatus =
	| { kind: "reading"; progress: number }
	| { kind: "finished" }
	| { kind: "unread"; minutes: number | null };

export function cardStatus(
	book: Parameters<typeof bookStatus>[0],
	minutesToRead: number | null,
): CardStatus {
	const status = bookStatus(book);
	if (status === "finished") return { kind: "finished" };
	if (status === "want") {
		return {
			kind: "unread",
			minutes: minutesToRead !== null && minutesToRead > 0 ? minutesToRead : null,
		};
	}
	return { kind: "reading", progress: readingProgress(book) };
}

export const StatusField: React.FC<{ status: CardStatus; id?: string }> = ({ status, id }) => {
	if (status.kind === "reading") {
		return (
			<span id={id} className="flex flex-1 items-center gap-1.5">
				<Progress value={status.progress} className="h-1 flex-1" aria-label="Reading progress" />
				<span className="text-[0.6875rem] text-muted-foreground tabular-nums">
					{status.progress}%
				</span>
			</span>
		);
	}
	if (status.kind === "finished") {
		return (
			<span id={id} className="flex items-center gap-1 text-[var(--goal-met)]">
				<Check aria-hidden className="size-3 shrink-0" strokeWidth={2.5} />
				Finished
			</span>
		);
	}
	// A book without a word count has no reading time; it is simply new.
	return (
		<span
			id={id}
			className="@container flex min-w-0 flex-1 items-center gap-1 text-muted-foreground"
		>
			{status.minutes !== null && <Clock aria-hidden className="size-3 shrink-0" />}
			<span className="truncate tabular-nums">
				{status.minutes !== null ? (
					<>
						{formatReadingTime(status.minutes)}
						{/* "12h 30m read" with its clock is about 7.75em: a card too narrow for it drops "read", not the time. */}
						<span className="@max-[7.75em]:sr-only"> read</span>
					</>
				) : (
					"New"
				)}
			</span>
		</span>
	);
};

export const RatingField: React.FC<{ rating: number }> = ({ rating }) => (
	<RatingStars rating={rating} starClassName="size-3" />
);

export const TextField: React.FC<{ text: string }> = ({ text }) => (
	<span className="truncate text-muted-foreground tabular-nums">{text}</span>
);

/** A book's field lines under its title, the same order on every surface. */
export const BookFieldLines: React.FC<{
	surface: CardSurface;
	fields: readonly CardFieldId[];
	book: { author: string | null; rating: number | null };
	status: CardStatus;
	values?: CardFieldValues;
	statusId?: string;
	/** The #N in its series, led into the author line. */
	seriesBadge?: React.ReactNode;
}> = ({ surface, fields, book, status, values, statusId, seriesBadge }) =>
	fields.map((field) => {
		if (field === "progress") {
			return (
				<CardFieldSlot key={field} surface={surface} field={field} className="mt-1">
					<StatusField status={status} id={statusId} />
				</CardFieldSlot>
			);
		}
		if (field === "rating") {
			// Sorting by rating is offered from the same screen, so a rating has to be visible here.
			return book.rating === null ? null : (
				<CardFieldSlot key={field} surface={surface} field={field}>
					<RatingField rating={book.rating} />
				</CardFieldSlot>
			);
		}
		const text = values?.[field] ?? (field === "author" ? displayAuthor(book.author ?? "") : "");
		if (field === "author" && seriesBadge) {
			return (
				<CardFieldSlot key={field} surface={surface} field={field}>
					<span className="truncate text-muted-foreground">
						{seriesBadge}
						{text && ` · ${text}`}
					</span>
				</CardFieldSlot>
			);
		}
		return text ? (
			<CardFieldSlot key={field} surface={surface} field={field}>
				<TextField text={text} />
			</CardFieldSlot>
		) : null;
	});
