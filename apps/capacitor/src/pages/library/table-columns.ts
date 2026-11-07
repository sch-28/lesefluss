import { BOOK_STATUS_LABELS, ratingStars } from "@lesefluss/core";
import { formatSeriesNumber } from "../../components/collections/series-numbering";
import { formatReadingTime } from "../../utils/reading-time";
import type { SeriesMemberships } from "./group-by";
import type { LibraryItem, SortBy, SortState } from "./sort-filter";

export type ColumnId =
	| "title"
	| "author"
	| "series"
	| "status"
	| "progress"
	| "rating"
	| "words"
	| "timeLeft"
	| "added"
	| "lastRead"
	| "highlights"
	| "tags"
	| "collections";

export type CellContext = {
	seriesMemberships: SeriesMemberships;
	/** Live collections by id. */
	collections: ReadonlyMap<string, { name: string; seriesKey: string | null }>;
};

export type TableColumn = {
	id: ColumnId;
	label: string;
	/** A CSS grid track. */
	width: string;
	align?: "end";
	/** Unset: the header does not sort. */
	sortBy?: SortBy;
	text: (item: LibraryItem, ctx: CellContext) => string;
};

const date = (ms: number | null) => (ms === null ? "" : new Date(ms).toLocaleDateString());
const bookOnly =
	(text: (item: Extract<LibraryItem, { kind: "book" }>, ctx: CellContext) => string) =>
	(item: LibraryItem, ctx: CellContext) =>
		item.kind === "book" ? text(item, ctx) : "";

export const TABLE_COLUMNS: readonly TableColumn[] = [
	{
		id: "title",
		label: "Title",
		width: "minmax(12rem, 3fr)",
		sortBy: "title",
		text: (item) => item.sortKey.title,
	},
	{
		id: "author",
		label: "Author",
		width: "minmax(8rem, 2fr)",
		sortBy: "author",
		text: (item) => item.sortKey.author,
	},
	{
		id: "series",
		label: "Series",
		width: "minmax(8rem, 2fr)",
		sortBy: "series",
		text: bookOnly(({ book }, ctx) =>
			(ctx.seriesMemberships.get(book.id) ?? [])
				.map(({ collectionId, seriesIndex }) => {
					const name = ctx.collections.get(collectionId)?.name;
					if (!name) return null;
					return seriesIndex === null ? name : `${name} ${formatSeriesNumber(seriesIndex)}`;
				})
				.filter((s) => s !== null)
				.join(", "),
		),
	},
	{
		id: "status",
		label: "Status",
		width: "minmax(6rem, 1fr)",
		sortBy: "status",
		text: (item) => BOOK_STATUS_LABELS[item.sortKey.status],
	},
	{
		id: "progress",
		label: "Progress",
		width: "5.5rem",
		align: "end",
		sortBy: "progress",
		text: (item) => `${item.sortKey.progress}%`,
	},
	{
		id: "rating",
		label: "Rating",
		width: "5rem",
		align: "end",
		sortBy: "rating",
		text: (item) => (item.sortKey.rating === null ? "" : `${ratingStars(item.sortKey.rating)} ★`),
	},
	{
		id: "words",
		label: "Words",
		width: "6rem",
		align: "end",
		sortBy: "words",
		text: (item) => (item.sortKey.words === null ? "" : item.sortKey.words.toLocaleString()),
	},
	{
		id: "timeLeft",
		label: "Time left",
		width: "6rem",
		align: "end",
		sortBy: "timeLeft",
		text: (item) =>
			item.sortKey.minutesLeft === null ? "" : formatReadingTime(item.sortKey.minutesLeft),
	},
	{
		id: "added",
		label: "Added",
		width: "6.5rem",
		align: "end",
		sortBy: "added",
		text: (item) => date(item.sortKey.added),
	},
	{
		id: "lastRead",
		label: "Last read",
		width: "6.5rem",
		align: "end",
		sortBy: "lastRead",
		text: (item) => date(item.sortKey.lastRead),
	},
	{
		id: "highlights",
		label: "Highlights",
		width: "6rem",
		align: "end",
		sortBy: "highlights",
		text: (item) => (item.sortKey.highlights === null ? "" : String(item.sortKey.highlights)),
	},
	{
		id: "tags",
		label: "Tags",
		width: "minmax(6rem, 1.5fr)",
		sortBy: "tags",
		text: (item) => item.sortKey.tags.join(", "),
	},
	{
		id: "collections",
		label: "Collections",
		width: "minmax(6rem, 1.5fr)",
		sortBy: "collections",
		text: (item) => item.sortKey.collections ?? "",
	},
];

const BY_ID = new Map(TABLE_COLUMNS.map((c) => [c.id, c]));

export const DEFAULT_COLUMNS: readonly ColumnId[] = [
	"title",
	"author",
	"series",
	"status",
	"progress",
	"rating",
	"lastRead",
];

/** The stored column list, in its order: unknown and repeated ids dropped, title always first. */
export function parseColumns(raw: string | null): ColumnId[] {
	let ids: unknown;
	try {
		ids = raw === null ? null : JSON.parse(raw);
	} catch {
		ids = null;
	}
	if (!Array.isArray(ids)) return [...DEFAULT_COLUMNS];
	const known = ids.filter(
		(id, i): id is ColumnId =>
			typeof id === "string" && BY_ID.has(id as ColumnId) && ids.indexOf(id) === i,
	);
	return ["title", ...known.filter((id) => id !== "title")];
}

export function serializeColumns(ids: readonly ColumnId[]): string {
	return JSON.stringify(ids);
}

/** Shows or hides one column; a shown one goes last, keeping the order of the rest. */
export function toggleColumn(ids: readonly ColumnId[], id: ColumnId): ColumnId[] {
	if (id === "title") return [...ids];
	return ids.includes(id) ? ids.filter((c) => c !== id) : [...ids, id];
}

export function columnsOf(ids: readonly ColumnId[]): TableColumn[] {
	return ids.map((id) => BY_ID.get(id)).filter((c) => c !== undefined);
}

/** Moves a column to sit before index `before` of the current list; title stays first. */
export function moveColumn(ids: readonly ColumnId[], id: ColumnId, before: number): ColumnId[] {
	const from = ids.indexOf(id);
	if (id === "title" || from < 0) return [...ids];
	const rest = ids.filter((c) => c !== id);
	const at = Math.max(1, Math.min(rest.length, from < before ? before - 1 : before));
	return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/**
 * What a header click does. A plain click sorts by that one column, flipping it
 * when it is already the first sort. Shift adds it as the second sort, flips the
 * second when it already is one, and flips the first when Shift-clicked.
 */
export function headerSort(current: SortState, sortBy: SortBy, shift = false): SortState {
	if (!shift) {
		const reversed = current.sortBy === sortBy ? !current.reversed : false;
		return { sortBy, reversed, thenBy: null, thenReversed: false };
	}
	if (current.sortBy === sortBy) return { ...current, reversed: !current.reversed };
	if (current.thenBy === sortBy) return { ...current, thenReversed: !current.thenReversed };
	return { ...current, thenBy: sortBy, thenReversed: false };
}
