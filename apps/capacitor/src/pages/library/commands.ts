import { HALF_STARS_PER_STAR } from "@lesefluss/core";
import type { Command } from "../../commands/registry";
import type { Book, Series } from "../../services/db/schema";
import type { FocusMove } from "./library-focus";

export type LibraryCommandInput = {
	books: readonly Book[];
	series: readonly Series[];
	openBook: (book: Book) => void;
	openSeries: (series: Series) => void;
	openUrlImport: () => void;
	pasteFromClipboard: () => void;
	isImporting: boolean;
};

export function libraryCommands(input: LibraryCommandInput): Command[] {
	const canImport = () => !input.isImporting;
	const commands: Command[] = [
		{
			id: "library.import-url",
			title: "Import from a link",
			keywords: ["url", "web", "article", "paste"],
			scope: "library",
			when: canImport,
			run: input.openUrlImport,
		},
		{
			id: "library.import-clipboard",
			title: "Import from clipboard",
			keywords: ["paste", "text"],
			scope: "library",
			when: canImport,
			run: input.pasteFromClipboard,
		},
	];
	for (const book of input.books) {
		commands.push({
			id: `library.book.${book.id}`,
			title: `Open book: ${book.title}`,
			keywords: book.author ? [book.author] : undefined,
			scope: "library",
			isSearchOnly: true,
			run: () => input.openBook(book),
		});
	}
	for (const series of input.series) {
		commands.push({
			id: `library.series.${series.id}`,
			title: `Open series: ${series.title}`,
			scope: "library",
			isSearchOnly: true,
			run: () => input.openSeries(series),
		});
	}
	return commands;
}

export type LibraryKeySheet = "status" | "add-tags" | "remove-tags" | "collection";

export type LibraryKeyInput = {
	canSearch: boolean;
	/** Grid, list or table shows at least one item. */
	hasItems: boolean;
	hasFocusedItem: boolean;
	hasFocusedBook: boolean;
	/** A selection, or else the focused book, for the edit keys to act on. */
	hasTargets: boolean;
	isBusy: boolean;
	canGroup: boolean;
	canEscape: boolean;
	focusSearch: () => void;
	move: (move: FocusMove) => void;
	openFocused: () => void;
	toggleFocused: () => void;
	escape: () => void;
	rate: (rating: number | null) => void;
	openSheet: (sheet: LibraryKeySheet) => void;
	openGroupBy: () => void;
};

const RATING_KEYS = [1, 2, 3, 4, 5] as const;

/**
 * The library's keyboard: one list for the dispatcher, the palette and the
 * shortcut sheet. Letter and digit keys also run with a button focused (a
 * clicked chip or card keeps focus); arrows and Enter leave a focused control
 * its own keys. `when` only gates on what the view offers, since the sheet and
 * palette hide a command whose `when` is off; a key with nothing to act on yet
 * (no focus, no selection) does nothing.
 */
export function libraryKeyCommands(input: LibraryKeyInput): Command[] {
	const hasItems = () => input.hasItems;
	const ifEditable = (action: () => void) => () => {
		if (input.hasTargets && !input.isBusy) action();
	};
	const nav = (id: string, title: string, keys: string[], move: FocusMove): Command => ({
		id,
		title,
		scope: "library",
		keys,
		inControls: keys[0]?.length === 1,
		when: hasItems,
		run: () => input.move(move),
	});
	const sheet = (
		id: string,
		title: string,
		key: string,
		target: LibraryKeySheet,
		keywords: string[],
	): Command => ({
		id,
		title,
		keywords,
		scope: "library",
		keys: [key],
		inControls: true,
		when: hasItems,
		run: ifEditable(() => input.openSheet(target)),
	});
	return [
		{
			id: "library.search",
			title: "Search library",
			keywords: ["find", "filter"],
			scope: "library",
			keys: ["/"],
			inControls: true,
			when: () => input.canSearch,
			run: input.focusSearch,
		},
		nav("library.focus-next", "Next book", ["j", "ArrowRight"], "next"),
		nav("library.focus-prev", "Previous book", ["k", "ArrowLeft"], "prev"),
		nav("library.focus-down", "Book below", ["ArrowDown"], "down"),
		nav("library.focus-up", "Book above", ["ArrowUp"], "up"),
		{
			id: "library.open-focused",
			title: "Open focused book",
			scope: "library",
			keys: ["Enter"],
			when: hasItems,
			run: () => {
				if (input.hasFocusedItem) input.openFocused();
			},
		},
		{
			id: "library.toggle-focused",
			title: "Select focused book",
			keywords: ["pick", "toggle"],
			scope: "library",
			keys: ["x"],
			inControls: true,
			when: hasItems,
			run: () => {
				if (input.hasFocusedBook && !input.isBusy) input.toggleFocused();
			},
		},
		{
			id: "library.escape",
			title: "Clear search, selection or focus",
			scope: "library",
			keys: ["Escape"],
			inControls: true,
			run: () => {
				if (input.canEscape) input.escape();
			},
		},
		...RATING_KEYS.map(
			(stars): Command => ({
				id: `library.rate-${stars}`,
				title: `Rate ${stars} star${stars === 1 ? "" : "s"}`,
				keywords: ["rating", "stars"],
				scope: "library",
				keys: [String(stars)],
				inControls: true,
				when: hasItems,
				run: ifEditable(() => input.rate(stars * HALF_STARS_PER_STAR)),
			}),
		),
		{
			id: "library.rate-clear",
			title: "Clear rating",
			keywords: ["rating", "stars", "unrated"],
			scope: "library",
			keys: ["0"],
			inControls: true,
			when: hasItems,
			run: ifEditable(() => input.rate(null)),
		},
		sheet("library.set-status", "Set reading status…", "s", "status", ["status", "finished"]),
		sheet("library.add-tags", "Add tags…", "t", "add-tags", ["tag", "label"]),
		sheet("library.remove-tags", "Remove tags…", "Shift+T", "remove-tags", ["tag", "untag"]),
		sheet("library.add-to-collection", "Add to collection…", "c", "collection", [
			"collection",
			"shelf",
		]),
		{
			id: "library.group-by",
			title: "Group by…",
			keywords: ["group", "author", "series"],
			scope: "library",
			keys: ["g"],
			inControls: true,
			when: () => input.canGroup,
			run: input.openGroupBy,
		},
	];
}
