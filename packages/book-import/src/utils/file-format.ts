/**
 * Book formats as seen from a *file name*, before anything is read.
 *
 * Deliberately not `BookPayload["fileFormat"]`: Markdown parses to `txt`, but a
 * folder scan still has to show and filter it as its own format. Use this when
 * all you have is a name; use the `matchers.ts` predicates once you have bytes
 * and a mime type.
 */
export type BookFileFormat = "txt" | "md" | "epub" | "html" | "pdf";

// Null-prototype: a file named `x.constructor` or `x.__proto__` would otherwise
// resolve through Object.prototype and return a function where a format belongs,
// which `?? null` cannot catch.
const EXTENSION_FORMATS: Record<string, BookFileFormat> = Object.assign(Object.create(null), {
	txt: "txt",
	md: "md",
	epub: "epub",
	html: "html",
	htm: "html",
	pdf: "pdf",
});

export const BOOK_FILE_EXTENSIONS: readonly string[] = Object.keys(EXTENSION_FORMATS);

/** The format `fileName` implies, or null when the extension isn't importable. */
export function bookFormatForFileName(fileName: string): BookFileFormat | null {
	const dot = fileName.lastIndexOf(".");
	if (dot <= 0) return null;
	return EXTENSION_FORMATS[fileName.slice(dot + 1).toLowerCase()] ?? null;
}

/**
 * Last-resort title for a file whose own metadata gives none. Only a recognised
 * book extension is stripped, so `Vol. 2` keeps its suffix.
 */
export function titleFromFileName(fileName: string): string {
	return bookFormatForFileName(fileName) ? fileName.slice(0, fileName.lastIndexOf(".")) : fileName;
}
