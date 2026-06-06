import { describe, expect, it } from "vitest";
import { epubParser } from "../parsers/epub";
import { buildEpub, linkFixture } from "../test-fixtures/build-epub";
import { extractParagraphs, extractParagraphsWithLinks } from "../utils/dom-paragraphs";

function parse(html: string): Element {
	return new DOMParser().parseFromString(`<article>${html}</article>`, "text/html").body;
}

describe("extractParagraphsWithLinks", () => {
	it("captures href and the exact char range of the link text", () => {
		const body = parse('<p>Read the <a href="https://example.com/docs">documentation</a> now.</p>');
		const { content, links } = extractParagraphsWithLinks(body);

		expect(content).toBe("Read the documentation now.");
		expect(links).toHaveLength(1);
		expect(links[0].href).toBe("https://example.com/docs");
		// The offsets must slice back to the visible link text.
		expect(content.slice(links[0].startChar, links[0].endChar)).toBe("documentation");
	});

	it("keeps offsets aligned across multiple paragraphs and links", () => {
		const body = parse(
			'<p>See <a href="https://a.example/one">link one</a> here.</p>' +
				'<p>And <a href="https://b.example/two">link two</a> there.</p>',
		);
		const { content, links } = extractParagraphsWithLinks(body);

		expect(content).toBe("See link one here.\n\nAnd link two there.");
		expect(links.map((l) => l.href)).toEqual(["https://a.example/one", "https://b.example/two"]);
		expect(content.slice(links[0].startChar, links[0].endChar)).toBe("link one");
		expect(content.slice(links[1].startChar, links[1].endChar)).toBe("link two");
	});

	it("handles a link whose text has nested markup and inner whitespace", () => {
		const body = parse(
			'<p>Go to <a href="https://x.example/y"> the  <em>big</em>  site </a> ok.</p>',
		);
		const { content, links } = extractParagraphsWithLinks(body);

		expect(content).toBe("Go to the big site ok.");
		expect(content.slice(links[0].startChar, links[0].endChar)).toBe("the big site");
	});

	it("drops anchors, relative paths, and dangerous schemes", () => {
		const body = parse(
			"<p>" +
				'<a href="#footnote">note</a> ' +
				'<a href="chapter2.xhtml">next</a> ' +
				'<a href="javascript:alert(1)">evil</a> ' +
				'<a href="data:text/html,x">data</a> ' +
				'<a href="https://safe.example">safe</a>' +
				"</p>",
		);
		const { links } = extractParagraphsWithLinks(body);

		expect(links).toHaveLength(1);
		expect(links[0].href).toBe("https://safe.example");
	});

	it("produces content identical to extractParagraphs", () => {
		const html =
			'<h1>Title</h1><p>Has a <a href="https://e.example">link</a>.</p><ul><li>One</li></ul>';
		const body = parse(html);
		expect(extractParagraphsWithLinks(body).content).toBe(extractParagraphs(body));
	});
});

describe("epubParser link ranges", () => {
	it("captures external links as byte ranges into content, dropping in-content anchors", async () => {
		const bytes = await buildEpub(linkFixture());
		const r = await epubParser.parse({ kind: "bytes", bytes, fileName: "links.epub" });

		expect(r.content).toBe("Read the documentation now.\n\nSee this note and another link here.");
		expect(r.linkRanges).toHaveLength(2);
		// Fixture content is ASCII, so byte offsets equal char offsets here.
		const slice = (l: { startByte: number; endByte: number }) =>
			r.content.slice(l.startByte, l.endByte);
		expect(r.linkRanges?.[0]).toMatchObject({ href: "https://example.com/docs" });
		expect(slice(r.linkRanges![0])).toBe("documentation");
		expect(r.linkRanges?.[1]).toMatchObject({ href: "https://other.org/x" });
		expect(slice(r.linkRanges![1])).toBe("another link");
	});
});
