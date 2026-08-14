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

import { blobToRawInput, fetchUrlToRawInput } from "@lesefluss/book-import";
import { CATALOG_URL } from "../catalog/client";
import type { Book } from "../db/schema";
import { commitBook } from "./commit";
import { parse, parseAndCommit } from "./pipeline";
import { readClipboardToRawInput } from "./sources/clipboard";
import { pickFileFromPicker } from "./sources/file-picker";
import type { ImportExtras, ImportOverrides, StagedImport } from "./types";

export { importScannedFile, probeScannedFile } from "./batch";
export { removeBook } from "./commit";
export type { FolderScan, ScannedFile, ScannedFileHandle } from "./sources/folder-scan";
export { pickBookFolder, readScannedFile } from "./sources/folder-scan";
export type { ImportExtras, ImportOverrides, StagedImport } from "./types";

/**
 * Write a staged import, with the reader's corrections applied over whatever the
 * parser guessed. The staging holder drops its reference once this resolves;
 * until then the payload is holding the whole book in memory.
 */
export async function commitStagedImport(
	staged: StagedImport,
	overrides?: ImportOverrides,
): Promise<Book> {
	return commitBook(staged.payload, staged.extras, overrides);
}

/**
 * Parse without writing. Each of these mirrors the committing entry point below
 * it; the confirm flow stages the result and commits it separately.
 *
 * Throws `Error("CANCELLED")` if the user dismissed the picker.
 */
export async function parseBookFromFile(onProgress?: (pct: number) => void): Promise<StagedImport> {
	const input = await pickFileFromPicker();
	return parse(input, {}, onProgress);
}

export async function parseBookFromClipboard(): Promise<StagedImport> {
	return parse(await readClipboardToRawInput());
}

export async function parseBookFromUrl(url: string): Promise<StagedImport> {
	const { input, finalUrl } = await fetchUrlToRawInput(url, { catalogUrl: CATALOG_URL });
	return parse(input, { source: "url", sourceUrl: finalUrl });
}

export async function parseBookFromText(
	text: string,
	hint?: { title?: string },
): Promise<StagedImport> {
	return parse({ kind: "text", text, hint });
}

export async function parseBookFromBlob(blob: Blob, fileName: string): Promise<StagedImport> {
	return parse(await blobToRawInput(blob, fileName));
}

/**
 * Parse and write in one step, without a confirm sheet. Only the catalog uses
 * this: its metadata is curated, and onboarding imports several starter books
 * at once, which would otherwise queue up a sheet per book during first run.
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
