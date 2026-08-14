/**
 * The commit runner: turn selected candidates into library rows, one at a time.
 *
 * Sequential on purpose. Each book's bytes, parsed text, and original file are
 * held only while that book is being written; running two at once would double
 * the peak and a folder of forty would exhaust the WebView heap.
 */

import type { ScannedFile } from "../../../services/book-import";
import { importErrorMessage } from "../import-errors";

export type ImportFailure = { file: ScannedFile; reason: string };

export type BatchProgress = {
	/** Books finished, successfully or not. */
	done: number;
	total: number;
	current: string;
};

export type BatchResult = {
	imported: number;
	failures: ImportFailure[];
	/** True when a cancel stopped the run before every selected file was tried. */
	cancelled: boolean;
};

export type RunImportOptions = {
	files: ScannedFile[];
	importFile: (file: ScannedFile) => Promise<unknown>;
	onProgress?: (progress: BatchProgress) => void;
	/** Checked between books: the in-flight one always finishes and stays written. */
	isCancelled?: () => boolean;
};

export async function runBatchImport({
	files,
	importFile,
	onProgress,
	isCancelled,
}: RunImportOptions): Promise<BatchResult> {
	const failures: ImportFailure[] = [];
	let imported = 0;

	for (const [index, file] of files.entries()) {
		if (isCancelled?.()) return { imported, failures, cancelled: true };

		onProgress?.({ done: index, total: files.length, current: file.name });
		try {
			await importFile(file);
			imported += 1;
		} catch (err) {
			// One unreadable file in a folder of hundreds must not end the run, so
			// the reason is collected for the summary and the loop moves on.
			failures.push({ file, reason: importErrorMessage(err) });
		}
	}

	onProgress?.({ done: files.length, total: files.length, current: "" });
	return { imported, failures, cancelled: false };
}
