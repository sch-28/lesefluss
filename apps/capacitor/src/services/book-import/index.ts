/**
 * Public API of the book-import subsystem.
 *
 * Every function here is a thin composition of (source → RawInput) plus
 * `runImportPipeline`. The real work lives in:
 *   - `sources/*`  — acquire bytes or text and return a `RawInput`
 *   - `parsers/*`  — turn a `RawInput` into a `BookPayload`
 *   - `commit.ts`  — persist a `BookPayload` as a `Book` row (+ disk)
 *
 * New entry points should stay two-liners: obtain a `RawInput`, delegate to
 * `runImportPipeline`. Anything more complex belongs in the pipeline itself.
 */

import type { ImportPipelineOptions, RawInput } from "@lesefluss/book-import";
import { blobToRawInput, fetchUrlToRawInput, runImportPipeline } from "@lesefluss/book-import";
import { CATALOG_URL } from "../catalog/client";
import type { Book } from "../db/schema";
import { commitBook } from "./commit";
import { readClipboardToRawInput } from "./sources/clipboard";
import { pickFileFromPicker } from "./sources/file-picker";
import type { ImportExtras } from "./types";

export { removeBook } from "./commit";
export type { ImportExtras } from "./types";

const pipelineOptions: ImportPipelineOptions = {
	loadPdfjs,
};

async function parseAndCommit(
	input: RawInput,
	extras: ImportExtras = {},
	onProgress?: (pct: number) => void,
): Promise<Book> {
	const payload = await runImportPipeline(input, pipelineOptions, onProgress);
	return commitBook(payload, extras);
}

/**
 * Open the system file picker, parse the selected file (TXT / EPUB / HTML),
 * and save it. Calls `onProgress` (0–100) where the parser emits progress.
 *
 * Throws `Error("CANCELLED")` if the user dismissed the picker.
 */
export async function importBook(onProgress?: (pct: number) => void): Promise<Book> {
	const input = await pickFileFromPicker();
	return parseAndCommit(input, {}, onProgress);
}

/**
 * Import from an already-in-memory Blob (e.g. downloaded EPUB from the
 * catalog). Same pipeline as `importBook` minus the file picker.
 */
export async function importBookFromBlob(
	blob: Blob,
	fileName: string,
	onProgress?: (pct: number) => void,
	extras?: ImportExtras,
): Promise<Book> {
	const input = await blobToRawInput(blob, fileName);
	return parseAndCommit(input, extras ?? {}, onProgress);
}

/**
 * Import from the system clipboard. Throws `Error("EMPTY")` if the clipboard
 * has no usable text.
 */
export async function importBookFromClipboard(): Promise<Book> {
	const input = await readClipboardToRawInput();
	return parseAndCommit(input);
}

/**
 * Fetch an article via the catalog proxy and import it. See `sources/url.ts`
 * for the error contract (`INVALID_URL`, `TOO_LARGE`, `FETCH_FAILED`).
 */
export async function importBookFromUrl(url: string): Promise<Book> {
	const { input, finalUrl } = await fetchUrlToRawInput(url, { catalogUrl: CATALOG_URL });
	return parseAndCommit(input, { source: "url", sourceUrl: finalUrl });
}

/**
 * Import from a plain-text string (e.g. shared plain text from another app).
 * `hint.title` overrides the first-line title heuristic in `textParser`.
 */
export async function importBookFromText(text: string, hint?: { title?: string }): Promise<Book> {
	return parseAndCommit({ kind: "text", text, hint });
}

async function loadPdfjs() {
	const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const { default: Worker } = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?worker");
	mod.GlobalWorkerOptions.workerPort = new Worker();
	return mod;
}
