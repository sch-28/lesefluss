/**
 * Normalised input to the parser pipeline. Produced by `sources/*`.
 *
 * - `bytes` variant covers file-picker, catalog downloads, share-intent file URIs.
 * - `text` variant covers clipboard paste and future plain-text sources. `hint`
 *   lets the source pass along a suggested title / originating URL so parsers or
 *   the commit step can populate metadata.
 */
export type RawInput =
	| { kind: "bytes"; bytes: ArrayBuffer; fileName: string; mimeType?: string }
	| { kind: "text"; text: string; hint?: { title?: string; url?: string } };

export type Chapter = {
	title: string;
	startByte: number;
};

/**
 * An external hyperlink captured at import, anchored to byte offsets in the
 * book's full `content`. Only http/https links are captured; the commit step
 * converts these to word-position ranges via the `WordIndex`.
 */
export type ImportLink = {
	href: string;
	startByte: number;
	endByte: number;
};

export type ProgressCallback = (pct: number) => void;

export type PdfDocumentLoadingTaskLike = {
	promise: Promise<unknown>;
};

export type PdfjsModuleLike = {
	getDocument(params: { data: ArrayBuffer }): PdfDocumentLoadingTaskLike;
};

export type LoadPdfjs = () => Promise<PdfjsModuleLike>;

export type DomParserLike = {
	parseFromString(html: string, type: DOMParserSupportedType | string): Document;
};

export type DomParserFactory = () => DomParserLike;

export type ImportPipelineOptions = {
	loadPdfjs?: LoadPdfjs;
	domParser?: DomParserFactory;
};

export type BookProbeOptions = Pick<ImportPipelineOptions, "loadPdfjs" | "domParser">;

/**
 * Canonical in-memory shape produced by any parser before DB commit.
 * `commitBook` is the single writer that turns this into a `Book` row.
 */
export type BookPayload = {
	content: string;
	title: string;
	author?: string | null;
	coverImage?: string | null;
	chapters?: Chapter[] | null;
	/** BCP 47 tag from the source file's metadata, verbatim. Null when absent. */
	language?: string | null;
	/** External hyperlinks (byte ranges into `content`). Null when none found. */
	linkRanges?: ImportLink[] | null;
	fileFormat: "txt" | "epub" | "html" | "pdf";
	/**
	 * Original file bytes to persist to disk (native only). Parsers set this
	 * when the format is worth preserving for future re-parse (EPUB, PDF);
	 * TXT leaves it null since `content` is already the source of truth.
	 */
	original?: { bytes: ArrayBuffer; extension: string } | null;
};

export interface Parser {
	readonly id: string;
	canParse(input: RawInput): boolean;
	parse(
		input: RawInput,
		onProgress?: ProgressCallback,
		options?: ImportPipelineOptions,
	): Promise<BookPayload>;
}
