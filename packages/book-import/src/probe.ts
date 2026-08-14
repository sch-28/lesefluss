import type { BookProbeOptions, RawInput } from "./types";
import { type BookFileFormat, bookFormatForFileName, titleFromFileName } from "./utils/file-format";

/** A probe always starts from a file: a scan has bytes and a name, never loose text. */
type FileInput = Extract<RawInput, { kind: "bytes" }>;

/**
 * What a folder-scan review screen shows for a candidate file. Everything else a
 * parser would produce (text, chapters, link ranges) is left unread: a scan
 * probes hundreds of files, and the full payload of even one book is large
 * enough that holding them all would exhaust the WebView heap.
 */
export type BookProbe = {
	title: string;
	author: string | null;
	coverImage: string | null;
	format: BookFileFormat | null;
};

/**
 * Read the little that a review screen needs from a file.
 *
 * Never throws. A file that is corrupt, truncated, encrypted, or simply not what
 * its extension claims degrades to its filename, because one bad file in a
 * folder must not fail the scan around it. Callers that need the real content
 * still go through `runImportPipeline`, which reports errors properly.
 *
 * Parsers are imported lazily, mirroring `parsers/registry.ts`, so probing does
 * not pull epubjs or pdfjs into the main chunk.
 */
export async function probeBookMetadata(
	input: FileInput,
	options: BookProbeOptions = {},
): Promise<BookProbe> {
	const format = bookFormatForFileName(input.fileName);
	const fallback: BookProbe = {
		title: titleFromFileName(input.fileName),
		author: null,
		coverImage: null,
		format,
	};

	try {
		if (format === "epub") {
			const { probeEpub } = await import("./parsers/epub");
			const { title, author, coverImage } = await probeEpub(input.bytes, input.fileName);
			return { title, author, coverImage, format };
		}

		if (format === "pdf") {
			const { probePdf } = await import("./parsers/pdf");
			const { title, author } = await probePdf(input.bytes, input.fileName, options.loadPdfjs);
			return { title, author, coverImage: null, format };
		}

		if (format === "html") {
			const { probeHtml } = await import("./parsers/html");
			const { title } = probeHtml(input.bytes, options.domParser);
			return { ...fallback, title: title ?? fallback.title };
		}
	} catch (err) {
		console.warn(`[book-import/probe] ${input.fileName}:`, err);
		return fallback;
	}

	// TXT and MD carry no metadata; their parsers derive a title the same way.
	return fallback;
}
