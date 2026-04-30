import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { IS_WEB } from "../../utils/platform";
import { getAllBooks } from "../db/queries/books";
import {
	getAllHighlights,
	getHighlightsByBook,
	getHighlightsByBooks,
} from "../db/queries/highlights";
import { getSeriesChapters, getSeriesList } from "../db/queries/series";
import type { Book, Highlight, Series } from "../db/schema";

export type ExportFormat = "markdown" | "csv";

export type ExportScope =
	| { type: "all" }
	| { type: "book"; id: string }
	| { type: "series"; id: string };

export type ExportOptions = {
	format: ExportFormat;
	scope: ExportScope;
};

export async function exportHighlights(options: ExportOptions): Promise<void> {
	const { format, scope } = options;

	const [rawHighlights, allBooks, allSeries] = await Promise.all([
		fetchHighlightsByScope(scope),
		getAllBooks(),
		getSeriesList(),
	]);

	if (rawHighlights.length === 0) {
		throw new Error("No highlights to export");
	}

	const bookMap = new Map<string, Book>(allBooks.map((b) => [b.id, b]));
	const seriesMap = new Map<string, Series>(allSeries.map((s) => [s.id, s]));

	const { content, filename } =
		format === "markdown"
			? formatMarkdown(rawHighlights, bookMap, seriesMap)
			: formatCsv(rawHighlights, bookMap, seriesMap);

	if (IS_WEB) {
		downloadBlob(content, filename, format === "markdown" ? "text/markdown" : "text/csv");
	} else {
		await shareFile(content, filename);
	}
}

async function fetchHighlightsByScope(scope: ExportScope): Promise<Highlight[]> {
	if (scope.type === "all") return getAllHighlights();
	if (scope.type === "book") return getHighlightsByBook(scope.id);
	const chapters = await getSeriesChapters(scope.id);
	return getHighlightsByBooks(chapters.map((c) => c.id));
}

function getDisplayTitle(book: Book | undefined, seriesMap: Map<string, Series>): string {
	if (!book) return "Unknown Book";
	if (!book.seriesId) return book.title;
	const s = seriesMap.get(book.seriesId);
	return `${s?.title ?? "Unknown Series"} · Ch. ${(book.chapterIndex ?? 0) + 1}`;
}

function getDisplayAuthor(book: Book | undefined, seriesMap: Map<string, Series>): string {
	if (!book) return "";
	if (!book.seriesId) return book.author ?? "";
	return seriesMap.get(book.seriesId)?.author ?? "";
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function csvEscape(value: string): string {
	const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
	if (safeValue.includes(",") || safeValue.includes('"') || safeValue.includes("\n")) {
		return `"${safeValue.replace(/"/g, '""')}"`;
	}
	return safeValue;
}

function markdownInline(value: string): string {
	return value.replace(/[\\`*_{}[\]()#+\-.!<>|]/g, "\\$&");
}

function markdownBlockquote(value: string): string {
	return value
		.replace(/<\/?[a-z][^>]*>/gi, "")
		.split("\n")
		.map((line) => `> ${markdownInline(line)}`)
		.join("\n");
}

function groupByBook(
	highlights: Highlight[],
	bookMap: Map<string, Book>,
): Array<{ book: Book | undefined; highlights: Highlight[] }> {
	const order: string[] = [];
	const groups = new Map<string, { book: Book | undefined; highlights: Highlight[] }>();

	for (const h of highlights) {
		let group = groups.get(h.bookId);
		if (!group) {
			order.push(h.bookId);
			group = { book: bookMap.get(h.bookId), highlights: [] };
			groups.set(h.bookId, group);
		}
		group.highlights.push(h);
	}

	return order
		.map((id) => groups.get(id))
		.filter((g): g is { book: Book | undefined; highlights: Highlight[] } => !!g);
}

function formatMarkdown(
	highlights: Highlight[],
	bookMap: Map<string, Book>,
	seriesMap: Map<string, Series>,
): { content: string; filename: string } {
	const groups = groupByBook(highlights, bookMap);
	const sections: string[] = [];

	for (const { book, highlights: hl } of groups) {
		const title = getDisplayTitle(book, seriesMap);
		const author = getDisplayAuthor(book, seriesMap);

		let section = `# ${markdownInline(title)}\n`;
		if (author) section += `*${markdownInline(author)}*\n`;
		section += "\n";

		for (const h of hl) {
			section += `${markdownBlockquote(h.text ?? "[Highlight text unavailable]")}\n\n`;
			if (h.note) section += `Note: ${markdownInline(h.note)}\n\n`;
			section += `*${formatDate(h.createdAt)}*\n\n---\n\n`;
		}

		sections.push(section.trimEnd());
	}

	return {
		content: sections.join("\n\n"),
		filename: "highlights.md",
	};
}

function formatCsv(
	highlights: Highlight[],
	bookMap: Map<string, Book>,
	seriesMap: Map<string, Series>,
): { content: string; filename: string } {
	const rows: string[] = ["Title,Author,Highlight,Note,Color,Date"];

	for (const h of highlights) {
		const book = bookMap.get(h.bookId);
		rows.push(
			[
				csvEscape(getDisplayTitle(book, seriesMap)),
				csvEscape(getDisplayAuthor(book, seriesMap)),
				csvEscape(h.text ?? ""),
				csvEscape(h.note ?? ""),
				h.color,
				formatDate(h.createdAt),
			].join(","),
		);
	}

	return {
		content: rows.join("\n"),
		filename: "highlights.csv",
	};
}

function downloadBlob(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareFile(content: string, filename: string): Promise<void> {
	await Filesystem.writeFile({
		path: filename,
		data: content,
		directory: Directory.Cache,
		encoding: Encoding.UTF8,
	});
	const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
	await Share.share({ files: [uri], dialogTitle: "Export Highlights" });
}
