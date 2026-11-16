import { BOOK_STATUS_LABELS, BOOK_STATUSES, type BookStatus } from "@lesefluss/core";

/** One entry of the book menu, in the order every surface shows them. */
export type BookActionId =
	| "open"
	| "status"
	| "rate"
	| "series"
	| "collection"
	| "edit"
	| "share"
	| "reset"
	| "extras"
	| "select"
	| "delete";

/** Where the menu opens. The first entry leads to whichever of the reader and
 *  the detail page a tap on that surface does not open. */
export type BookActionSurface = "card" | "detail" | "reader" | "stats";

const ORDER: readonly BookActionId[] = [
	"open",
	"status",
	"rate",
	"series",
	"collection",
	"edit",
	"share",
	"extras",
	"select",
	"reset",
	"delete",
];

/** Reset progress and Delete close the menu as their own group, set apart from the rest. */
export function isDangerAction(id: string): boolean {
	return id === "reset" || id === "delete";
}

export function bookActionIds(options: {
	canShare: boolean;
	canSelect: boolean;
	hasExtras: boolean;
	/** Where Reset progress and Delete live in the book page's danger zone instead. */
	omitsDestructive?: boolean;
}): BookActionId[] {
	return ORDER.filter((id) => {
		if (isDangerAction(id)) return !options.omitsDestructive;
		if (id === "share") return options.canShare;
		if (id === "select") return options.canSelect;
		if (id === "extras") return options.hasExtras;
		return true;
	});
}

/** The reader's menu leads to the book page, whose danger zone holds the destructive actions. */
export function omitsDestructive(surface: BookActionSurface): boolean {
	return surface === "detail" || surface === "reader";
}

export function opensReader(surface: BookActionSurface): boolean {
	return surface === "detail" || surface === "stats";
}

/** Every status choice: Automatic first, then the shelves, with the one in force. */
export function statusChoices(
	stored: BookStatus | null,
	automatic: BookStatus,
): { status: BookStatus | null; label: string; isCurrent: boolean }[] {
	return [
		{
			status: null,
			label: `Automatic · ${BOOK_STATUS_LABELS[automatic]}`,
			isCurrent: stored === null,
		},
		...BOOK_STATUSES.map((status) => ({
			status,
			label: BOOK_STATUS_LABELS[status],
			isCurrent: stored === status,
		})),
	];
}
