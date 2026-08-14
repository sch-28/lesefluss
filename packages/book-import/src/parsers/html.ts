import { Readability } from "@mozilla/readability";
import type { BookPayload, DomParserFactory, ImportLink, Parser } from "../types";
import { type ContentLink, extractParagraphsWithLinks } from "../utils/dom-paragraphs";
import { utf8ByteLength } from "../utils/encoding";
import { assertBytes } from "../utils/raw-input";
import { deriveTitle, firstTitleLikeLine } from "../utils/title-heuristic";
import { canParseHtml } from "./matchers";

// linkedom's parseFromString silently produces an empty body when the input
// is a body fragment without <html>/<body> wrapping, so any caller that hands
// us already-extracted article HTML (e.g. the browser extension after running
// Readability in-page) needs the wrapper added back before parsing.
function ensureFullDocument(html: string): string {
	const head = html.slice(0, 256).toLowerCase();
	if (head.includes("<!doctype") || head.includes("<html")) return html;
	return `<!DOCTYPE html><html><head></head><body>${html}</body></html>`;
}

/**
 * The document title, without running Readability.
 *
 * Follows the same chain as `parse` minus its first step: `<title>`, then the
 * first line of body text. Readability is skipped because it is the expensive
 * half; it would otherwise supply `article.title` (which strips site-name
 * suffixes, so "Post | Blog" becomes "Post") and, for a document with no
 * `<title>`, a heading-derived name. A probed title can therefore still differ
 * from the imported one there, and for a title-less document that opens with
 * prose, where this yields the filename and the parse yields a timestamp.
 * Author needs Readability's byline and is left to the parse.
 */
export function probeHtml(
	bytes: ArrayBuffer,
	domParser?: DomParserFactory,
): { title: string | null } {
	const html = new TextDecoder("utf-8").decode(bytes);
	const parser = domParser?.() ?? new DOMParser();
	const doc = parser.parseFromString(ensureFullDocument(html), "text/html");

	const documentTitle = doc.title?.trim();
	if (documentTitle) return { title: documentTitle };

	// Matches `parse`'s own last resort, minus its timestamp branch: `deriveTitle`
	// stamps the current time when the text opens with prose, so probing and
	// importing the same file minutes apart would produce titles that can never
	// compare equal. Null there instead, and the caller falls back to the filename.
	const { content } = extractParagraphsWithLinks(doc.body);
	return { title: content ? firstTitleLikeLine(content) : null };
}

export const htmlParser: Parser = {
	id: "html",

	canParse: canParseHtml,

	async parse(input, _onProgress, options): Promise<BookPayload> {
		assertBytes(input);
		const html = new TextDecoder("utf-8").decode(input.bytes);
		const domParser = options?.domParser?.() ?? new DOMParser();
		const doc = domParser.parseFromString(ensureFullDocument(html), "text/html");

		// Readability mutates the document it receives, so give it a clone.
		// It also throws on already-extracted fragments lacking a real <body>;
		// treat that the same as a null result and fall through to the body walk.
		let article: ReturnType<Readability["parse"]> = null;
		try {
			article = new Readability(doc.cloneNode(true) as Document).parse();
		} catch {
			article = null;
		}

		let content: string;
		let links: ContentLink[];
		let title: string;
		let author: string | null;

		if (article?.content) {
			const articleDoc = domParser.parseFromString(article.content, "text/html");
			({ content, links } = extractParagraphsWithLinks(articleDoc.body));
			title = article.title?.trim() || doc.title?.trim() || deriveTitle(content);
			author = article.byline?.trim() || null;
			if (!content) {
				({ content, links } = extractParagraphsWithLinks(doc.body));
			}
		} else {
			// Fallback: walk the entire body. Noisier (nav/footer leak in) but
			// still better than failing the import outright.
			({ content, links } = extractParagraphsWithLinks(doc.body));
			title = doc.title?.trim() || deriveTitle(content);
			author = null;
		}

		const linkRanges: ImportLink[] = links.map((l) => ({
			href: l.href,
			startByte: utf8ByteLength(content.slice(0, l.startChar)),
			endByte: utf8ByteLength(content.slice(0, l.endChar)),
		}));

		return {
			content,
			title,
			author,
			coverImage: null,
			chapters: null,
			linkRanges: linkRanges.length > 0 ? linkRanges : null,
			fileFormat: "html",
			original: null,
		};
	},
};
