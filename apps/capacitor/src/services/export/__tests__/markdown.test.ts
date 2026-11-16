import { wordPos } from "@lesefluss/core";
import { describe, expect, it } from "vitest";
import type { Book, Highlight, Series } from "../../db/schema";
import { escapeMarkdownLine, fileNameFor, formatMarkdown, quoteBlock } from "../markdown";

const NOW = new Date(2026, 10, 12, 9, 30);

function book(overrides: Partial<Book> = {}): Book {
	return {
		id: "b1",
		title: "Morning Star",
		author: "Pierce Brown",
		seriesId: null,
		chapterIndex: null,
		sourceUrl: null,
		catalogId: null,
		...overrides,
	} as Book;
}

let seq = 0;
function highlight(overrides: Partial<Highlight> = {}): Highlight {
	seq += 1;
	return {
		id: `h${seq}`,
		bookId: "b1",
		startWord: wordPos(0),
		startCharInWord: 0,
		endWord: 1,
		endCharInWord: 0,
		color: "yellow",
		note: null,
		text: "Plain text",
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	} as Highlight;
}

function exportOne(highlights: Highlight[], b: Book = book()) {
	return formatMarkdown(highlights, new Map([[b.id, b]]), new Map<string, Series>(), {
		collectionTitle: "Lesefluss highlights",
		now: NOW,
	});
}

describe("formatMarkdown for one book", () => {
	it("names the file after the book and opens with YAML front matter", () => {
		const { content, filename } = exportOne([highlight()]);
		expect(filename).toBe("Morning Star.md");
		expect(
			content.startsWith(
				'---\ntitle: "Morning Star"\nauthor: "Pierce Brown"\nexported: 2026-11-12\n---\n\n',
			),
		).toBe(true);
	});

	it("adds the source when the book has one", () => {
		const { content } = exportOne([highlight()], book({ catalogId: "gutenberg:1342" }));
		expect(content).toContain('source: "https://www.gutenberg.org/ebooks/1342"\n');
	});

	it("quotes a title with YAML-significant characters", () => {
		const { content } = exportOne([highlight()], book({ title: 'Say "hi": #1', author: null }));
		expect(content).toContain('title: "Say \\"hi\\": #1"\n');
		expect(content).not.toContain("author:");
	});

	it("lists every highlight in reading order, whatever order they come in", () => {
		const { content } = exportOne([
			highlight({ text: "third", startWord: wordPos(90) }),
			highlight({ text: "first", startWord: wordPos(5), startCharInWord: 0 }),
			highlight({ text: "second", startWord: wordPos(5), startCharInWord: 3 }),
		]);
		const order = ["first", "second", "third"].map((t) => content.indexOf(`> ${t}`));
		expect(order.every((i) => i > 0)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});

	it("puts the note directly under its quote, then the color tag", () => {
		const { content } = exportOne([
			highlight({ text: "Break the chains", note: "Darrow's motto", color: "pink" }),
		]);
		expect(content).toContain("> Break the chains\n\nDarrow's motto\n\n#highlight/pink");
	});

	it("tags a highlight without a note by its color", () => {
		const { content } = exportOne([highlight({ text: "Quiet", color: "blue" })]);
		expect(content).toContain("> Quiet\n\n#highlight/blue");
	});

	it("separates highlights with a rule", () => {
		const { content } = exportOne([
			highlight({ text: "one", startWord: wordPos(1) }),
			highlight({ text: "two", startWord: wordPos(2) }),
		]);
		expect(content).toContain("#highlight/yellow\n\n---\n\n> two");
	});
});

describe("Markdown escaping", () => {
	it("escapes inline Markdown and Obsidian syntax", () => {
		expect(escapeMarkdownLine("*bold* _it_ `code` [[link]] #tag ==mark== %%c%% $x$ ^id")).toBe(
			"\\*bold\\* \\_it\\_ \\`code\\` \\[\\[link\\]\\] \\#tag \\=\\=mark\\=\\= \\%\\%c\\%\\% \\$x\\$ \\^id",
		);
	});

	it("escapes HTML, entities, pipes and backslashes", () => {
		expect(escapeMarkdownLine("<b>a</b> &amp; a|b \\n")).toBe(
			"\\<b\\>a\\</b\\> \\&amp; a\\|b \\\\n",
		);
	});

	it("keeps a line from turning into a list, heading or code block", () => {
		expect(escapeMarkdownLine("1. one")).toBe("1\\. one");
		expect(escapeMarkdownLine("2) two")).toBe("2\\) two");
		expect(escapeMarkdownLine("- dash")).toBe("\\- dash");
		expect(escapeMarkdownLine("+ plus")).toBe("\\+ plus");
		expect(escapeMarkdownLine("# Heading")).toBe("\\# Heading");
		expect(escapeMarkdownLine("    indented")).toBe("indented");
		expect(escapeMarkdownLine("> quote")).toBe("\\> quote");
	});

	it("leaves ordinary prose alone", () => {
		expect(escapeMarkdownLine("Mr. Brown, 1984 - not a list.")).toBe(
			"Mr. Brown, 1984 - not a list.",
		);
	});

	it("keeps line breaks inside one quote, blank lines included", () => {
		expect(quoteBlock("first\r\nsecond\n\n---\n===")).toBe(
			"> first\n> second\n>\n> \\---\n> \\=\\=\\=",
		);
	});

	it("escapes multi-line notes line by line", () => {
		const { content } = exportOne([highlight({ text: "q", note: "line *one*\n- two" })]);
		expect(content).toContain("> q\n\nline \\*one\\*\n\\- two\n\n#highlight/yellow");
	});
});

describe("fileNameFor", () => {
	it("drops characters file systems and Obsidian links refuse", () => {
		expect(fileNameFor('Dune: Part 1/2 "Fear" #1 [x] ^a|b?')).toBe("Dune Part 1 2 Fear 1 x a b.md");
	});

	it("falls back when nothing usable is left", () => {
		expect(fileNameFor("...")).toBe("Highlights.md");
	});

	it("keeps a long CJK title under the 255-byte name limit", () => {
		const name = fileNameFor("夜".repeat(200));
		expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(255);
	});
});

describe("formatMarkdown for several books", () => {
	it("writes one file with a heading per book", () => {
		const a = book({ id: "a", title: "Zeta" });
		const b = book({ id: "b", title: "Alpha", author: null });
		const { content, filename } = formatMarkdown(
			[
				highlight({ bookId: "a", text: "from zeta" }),
				highlight({ bookId: "b", text: "from alpha" }),
			],
			new Map([
				[a.id, a],
				[b.id, b],
			]),
			new Map(),
			{ collectionTitle: "Lesefluss highlights", now: NOW },
		);
		expect(filename).toBe("Lesefluss highlights.md");
		expect(
			content.startsWith(
				'---\ntitle: "Lesefluss highlights"\nexported: 2026-11-12\n---\n\n# Alpha\n\n> from alpha',
			),
		).toBe(true);
		expect(content).toContain("# Zeta\n\n*Pierce Brown*\n\n> from zeta");
	});

	it("orders a series by chapter", () => {
		const series = { id: "s", title: "Red Rising", author: "Pierce Brown" } as Series;
		const ch = (id: string, index: number) =>
			book({ id, title: id, seriesId: "s", chapterIndex: index, author: null });
		const books = [ch("c10", 9), ch("c2", 1)];
		const { content } = formatMarkdown(
			[highlight({ bookId: "c10", text: "late" }), highlight({ bookId: "c2", text: "early" })],
			new Map(books.map((b) => [b.id, b])),
			new Map([[series.id, series]]),
			{ collectionTitle: "Red Rising", now: NOW },
		);
		expect(content.indexOf("Ch. 2")).toBeLessThan(content.indexOf("Ch. 10"));
	});
});
