import { externalSourceUrl } from "../catalog/client";
import type { Book, Highlight, Series } from "../db/schema";

export type ExportFile = { content: string; filename: string };

type BookGroup = { book: Book | undefined; highlights: Highlight[] };

const INLINE_SPECIAL = /[\\`*_[\]<>#|~=$%^&]/g;

/**
 * Escapes one line of user text so Obsidian renders it literally: inline marks, Obsidian's own
 * syntax (`==mark==`, `%%comment%%`, `$math$`, `[[link]]`, `#tag`, `^block`) and the line-start
 * forms that would turn it into a list, heading or code block.
 */
export function escapeMarkdownLine(line: string): string {
	return line
		.trim()
		.replace(INLINE_SPECIAL, "\\$&")
		.replace(/^(\d+)([.)])/, "$1\\$2")
		.replace(/^([-+])/, "\\$1");
}

function textLines(value: string): string[] {
	return value.replace(/\r\n?/g, "\n").split("\n").map(escapeMarkdownLine);
}

export function quoteBlock(value: string): string {
	return textLines(value)
		.map((line) => (line ? `> ${line}` : ">"))
		.join("\n");
}

function noteBlock(value: string): string {
	return textLines(value).join("\n").trim();
}

/** JSON strings are valid YAML double-quoted scalars; U+2028/9 are escaped so YAML 1.1 parsers keep one line. */
function yamlString(value: string): string {
	return JSON.stringify(value).replace(
		/[\u2028\u2029]/g,
		(c) => `\\u${c.charCodeAt(0).toString(16)}`,
	);
}

function frontMatter(fields: Array<[string, string | null]>): string {
	const lines = fields
		.filter((field): field is [string, string] => !!field[1])
		.map(([key, value]) => `${key}: ${key === "exported" ? value : yamlString(value)}`);
	return `---\n${lines.join("\n")}\n---`;
}

/** Characters Windows, Android or Obsidian links refuse in a file name. */
export function fileNameFor(title: string): string {
	const base = title
		// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it strips
		.replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, " ")
		.replace(/\s+/g, " ")
		.replace(/^[\s.]+|[\s.]+$/g, "");
	// 80 code points stays under the 255-byte name limit even for CJK titles.
	const capped = Array.from(base).slice(0, 80).join("").trim();
	return `${capped || "Highlights"}.md`;
}

function localDate(now: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function exportBookTitle(book: Book | undefined, seriesMap: Map<string, Series>): string {
	if (!book) return "Unknown Book";
	if (!book.seriesId) return book.title;
	const s = seriesMap.get(book.seriesId);
	return `${s?.title ?? "Unknown Series"} · Ch. ${(book.chapterIndex ?? 0) + 1}`;
}

export function exportBookAuthor(book: Book | undefined, seriesMap: Map<string, Series>): string {
	if (!book) return "";
	if (!book.seriesId) return book.author ?? "";
	return seriesMap.get(book.seriesId)?.author ?? "";
}

function bookSource(book: Book | undefined): string | null {
	if (!book) return null;
	const own = book.chapterSourceUrl ?? book.sourceUrl;
	if (own) return own;
	return book.catalogId ? externalSourceUrl(book.catalogId) : null;
}

function byReadingOrder(a: Highlight, b: Highlight): number {
	return a.startWord - b.startWord || a.startCharInWord - b.startCharInWord;
}

function groupByBook(
	highlights: Highlight[],
	bookMap: Map<string, Book>,
	seriesMap: Map<string, Series>,
): BookGroup[] {
	const groups = new Map<string, BookGroup>();
	for (const h of highlights) {
		let group = groups.get(h.bookId);
		if (!group) {
			group = { book: bookMap.get(h.bookId), highlights: [] };
			groups.set(h.bookId, group);
		}
		group.highlights.push(h);
	}
	for (const group of groups.values()) group.highlights.sort(byReadingOrder);
	return [...groups.values()].sort((a, b) => {
		if (a.book?.seriesId && a.book.seriesId === b.book?.seriesId) {
			return (a.book.chapterIndex ?? 0) - (b.book.chapterIndex ?? 0);
		}
		return exportBookTitle(a.book, seriesMap).localeCompare(exportBookTitle(b.book, seriesMap));
	});
}

function colorTag(color: string): string | null {
	const slug = color.toLowerCase().replace(/[^a-z0-9-]/g, "");
	return slug ? `#highlight/${slug}` : null;
}

function highlightBlock(h: Highlight): string {
	const parts = [quoteBlock(h.text ?? "[Highlight text unavailable]")];
	const note = h.note ? noteBlock(h.note) : "";
	if (note) parts.push(note);
	const tag = colorTag(h.color);
	if (tag) parts.push(tag);
	return parts.join("\n\n");
}

function highlightBlocks(highlights: Highlight[]): string {
	return highlights.map(highlightBlock).join("\n\n---\n\n");
}

/**
 * One Obsidian note. A single book gets its own front matter and file name; several books (all
 * books, a series) share one file with a heading per book.
 */
export function formatMarkdown(
	highlights: Highlight[],
	bookMap: Map<string, Book>,
	seriesMap: Map<string, Series>,
	options: { collectionTitle: string; now?: Date },
): ExportFile {
	const exported = localDate(options.now ?? new Date());
	const groups = groupByBook(highlights, bookMap, seriesMap);

	if (groups.length === 1) {
		const [{ book, highlights: hl }] = groups;
		const title = exportBookTitle(book, seriesMap);
		const header = frontMatter([
			["title", title],
			["author", exportBookAuthor(book, seriesMap)],
			["source", bookSource(book)],
			["exported", exported],
		]);
		return { content: `${header}\n\n${highlightBlocks(hl)}\n`, filename: fileNameFor(title) };
	}

	const sections = groups.map(({ book, highlights: hl }) => {
		const author = exportBookAuthor(book, seriesMap);
		const heading = `# ${escapeMarkdownLine(exportBookTitle(book, seriesMap))}`;
		const byline = author ? `\n\n*${escapeMarkdownLine(author)}*` : "";
		return `${heading}${byline}\n\n${highlightBlocks(hl)}`;
	});
	const header = frontMatter([
		["title", options.collectionTitle],
		["exported", exported],
	]);
	return {
		content: `${header}\n\n${sections.join("\n\n")}\n`,
		filename: fileNameFor(options.collectionTitle),
	};
}
