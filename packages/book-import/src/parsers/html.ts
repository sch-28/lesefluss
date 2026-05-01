import { Readability } from "@mozilla/readability";
import type { BookPayload, Parser } from "../types";
import { extractParagraphs } from "../utils/dom-paragraphs";
import { assertBytes } from "../utils/raw-input";
import { deriveTitle } from "../utils/title-heuristic";
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
		let title: string;
		let author: string | null;

		if (article?.content) {
			const articleDoc = domParser.parseFromString(article.content, "text/html");
			content = extractParagraphs(articleDoc.body);
			title = article.title?.trim() || doc.title?.trim() || deriveTitle(content);
			author = article.byline?.trim() || null;
			if (!content) {
				content = extractParagraphs(doc.body);
			}
		} else {
			// Fallback: walk the entire body. Noisier (nav/footer leak in) but
			// still better than failing the import outright.
			content = extractParagraphs(doc.body);
			title = doc.title?.trim() || deriveTitle(content);
			author = null;
		}

		return {
			content,
			title,
			author,
			coverImage: null,
			chapters: null,
			fileFormat: "html",
			original: null,
		};
	},
};
