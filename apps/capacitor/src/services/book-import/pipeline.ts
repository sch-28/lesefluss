/**
 * The app's binding of the shared import pipeline: how a `RawInput` becomes a
 * staged payload, and how a staged payload becomes a `Book` row.
 *
 * Separate from `index.ts` so the entry points there and the folder-scan ones in
 * `batch.ts` can both build on it without the barrel importing its own consumer.
 */

import type { ImportPipelineOptions, RawInput } from "@lesefluss/book-import";
import { runImportPipeline } from "@lesefluss/book-import";
import type { Book } from "../db/schema";
import { commitBook } from "./commit";
import type { ImportExtras, StagedImport } from "./types";

export const pipelineOptions: ImportPipelineOptions = {
	loadPdfjs,
};

export async function parse(
	input: RawInput,
	extras: ImportExtras = {},
	onProgress?: (pct: number) => void,
): Promise<StagedImport> {
	const payload = await runImportPipeline(input, pipelineOptions, onProgress);
	return { payload, extras };
}

export async function parseAndCommit(
	input: RawInput,
	extras: ImportExtras = {},
	onProgress?: (pct: number) => void,
): Promise<Book> {
	const staged = await parse(input, extras, onProgress);
	return commitBook(staged.payload, staged.extras);
}

/**
 * Dynamically import pdfjs so it stays out of the main chunk, configuring the
 * bundler's worker before the module is handed to the parser.
 */
async function loadPdfjs() {
	const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const { default: Worker } = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?worker");
	mod.GlobalWorkerOptions.workerPort = new Worker();
	return mod;
}
