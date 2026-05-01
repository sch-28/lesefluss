import type { RawInput } from "../types";

export function canParseEpub(input: RawInput): boolean {
	if (input.kind !== "bytes") return false;
	return (
		input.fileName.toLowerCase().endsWith(".epub") || input.mimeType === "application/epub+zip"
	);
}

export function canParseHtml(input: RawInput): boolean {
	if (input.kind !== "bytes") return false;
	const name = input.fileName.toLowerCase();
	return (
		name.endsWith(".html") ||
		name.endsWith(".htm") ||
		input.mimeType === "text/html" ||
		input.mimeType === "application/xhtml+xml"
	);
}

export function canParsePdf(input: RawInput): boolean {
	if (input.kind !== "bytes") return false;
	return input.fileName.toLowerCase().endsWith(".pdf") || input.mimeType === "application/pdf";
}

export function canParseMarkdown(input: RawInput): boolean {
	if (input.kind !== "bytes") return false;
	return input.fileName.toLowerCase().endsWith(".md") || input.mimeType === "text/markdown";
}

export function canParseTxt(input: RawInput): boolean {
	if (input.kind !== "bytes") return false;
	return (
		input.fileName.toLowerCase().endsWith(".txt") || (input.mimeType?.startsWith("text/") ?? false)
	);
}

export function canParseText(input: RawInput): boolean {
	return input.kind === "text";
}
