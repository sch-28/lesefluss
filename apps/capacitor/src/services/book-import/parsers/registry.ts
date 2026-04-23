import type { Parser, RawInput } from "../types";
import { epubParser } from "./epub";
import { htmlParser } from "./html";
import { pdfParser } from "./pdf";
import { textParser } from "./text";
import { txtParser } from "./txt";

/**
 * Parsers tried in order; first `canParse` match wins. Specific matchers
 * (EPUB, HTML, PDF) come before broader fallbacks (TXT, text).
 */
const PARSERS: Parser[] = [epubParser, htmlParser, pdfParser, txtParser, textParser];

export function pickParser(input: RawInput): Parser {
	const parser = PARSERS.find((p) => p.canParse(input));
	if (!parser) {
		const desc = input.kind === "bytes" ? input.fileName : "text input";
		throw new Error(`No parser available for ${desc}`);
	}
	return parser;
}
