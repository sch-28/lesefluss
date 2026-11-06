import type { Command } from "../../commands/registry";
import type { Book, Series } from "../../services/db/schema";

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
