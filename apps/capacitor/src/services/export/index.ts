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
import { type ExportFile, exportBookAuthor, exportBookTitle, formatMarkdown } from "./markdown";

export type ExportFormat = "markdown" | "csv";

export type ExportScope =
	| { type: "all" }
	| { type: "book"; id: string }
	| { type: "series"; id: string };

export type ExportOptions = {
	format: ExportFormat;
	scope: ExportScope;
};

/** Resolves false when the user dismissed the share sheet without sharing. */
export async function exportHighlights(options: ExportOptions): Promise<boolean> {
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
			? formatMarkdown(rawHighlights, bookMap, seriesMap, {
					collectionTitle: collectionTitle(scope, seriesMap),
				})
			: formatCsv(rawHighlights, bookMap, seriesMap);

	if (IS_WEB) {
		downloadBlob(content, filename, format === "markdown" ? "text/markdown" : "text/csv");
		return true;
	}
	return shareFile(content, filename);
}

function collectionTitle(scope: ExportScope, seriesMap: Map<string, Series>): string {
	if (scope.type === "series") return seriesMap.get(scope.id)?.title ?? "Highlights";
	return "Lesefluss highlights";
}

async function fetchHighlightsByScope(scope: ExportScope): Promise<Highlight[]> {
	if (scope.type === "all") return getAllHighlights();
	if (scope.type === "book") return getHighlightsByBook(scope.id);
	const chapters = await getSeriesChapters(scope.id);
	return getHighlightsByBooks(chapters.map((c) => c.id));
}

function csvEscape(value: string): string {
	const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
	if (safeValue.includes(",") || safeValue.includes('"') || safeValue.includes("\n")) {
		return `"${safeValue.replace(/"/g, '""')}"`;
	}
	return safeValue;
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function formatCsv(
	highlights: Highlight[],
	bookMap: Map<string, Book>,
	seriesMap: Map<string, Series>,
): ExportFile {
	const rows: string[] = ["Title,Author,Highlight,Note,Color,Date"];

	for (const h of highlights) {
		const book = bookMap.get(h.bookId);
		rows.push(
			[
				csvEscape(exportBookTitle(book, seriesMap)),
				csvEscape(exportBookAuthor(book, seriesMap)),
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

async function shareFile(content: string, filename: string): Promise<boolean> {
	await Filesystem.writeFile({
		path: filename,
		data: content,
		directory: Directory.Cache,
		encoding: Encoding.UTF8,
	});
	const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
	try {
		await Share.share({ files: [uri], dialogTitle: "Export Highlights" });
		return true;
	} catch (err) {
		if (err instanceof Error && /cancel/i.test(err.message)) return false;
		throw err;
	}
}
