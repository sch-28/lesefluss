import type { Parser, RawInput } from "../types";
import {
	canParseEpub,
	canParseHtml,
	canParseMarkdown,
	canParsePdf,
	canParseText,
	canParseTxt,
} from "./matchers";

/**
 * Parsers tried in order; first `canParse` match wins. Specific matchers
 * (EPUB, HTML, PDF, MD) come before broader fallbacks (TXT, text).
 */
const PARSER_LOADERS: readonly {
	canParse(input: RawInput): boolean;
	load(): Promise<Parser>;
}[] = [
	{
		canParse: canParseEpub,
		load: async () => (await import("./epub")).epubParser,
	},
	{
		canParse: canParseHtml,
		load: async () => (await import("./html")).htmlParser,
	},
	{
		canParse: canParsePdf,
		load: async () => (await import("./pdf")).pdfParser,
	},
	{
		canParse: canParseMarkdown,
		load: async () => (await import("./md")).mdParser,
	},
	{
		canParse: canParseTxt,
		load: async () => (await import("./txt")).txtParser,
	},
	{
		canParse: canParseText,
		load: async () => (await import("./text")).textParser,
	},
];

export async function pickParser(input: RawInput): Promise<Parser> {
	const loader = PARSER_LOADERS.find((p) => p.canParse(input));
	if (!loader) {
		const desc = input.kind === "bytes" ? input.fileName : "text input";
		throw new Error(`No parser available for ${desc}`);
	}
	const parser = await loader.load();
	if (!parser.canParse(input)) {
		const desc = input.kind === "bytes" ? input.fileName : "text input";
		throw new Error(`No parser available for ${desc}`);
	}
	return parser;
}
