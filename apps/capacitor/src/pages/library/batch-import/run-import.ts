/**
 * The commit runner: turn selected candidates into library rows, one at a time.
 *
 * The sequencing, per-item failure handling and cancellation all live in
 * `runSequential`; this only supplies what is import-specific — how to name a
 * file in the progress line, and how to turn a parser error into something a
 * reader can read.
 */

import { runSequential, type SequentialProgress } from "../../../services/batch/run-sequential";
import type { ScannedFile } from "../../../services/book-import";
import { importErrorMessage } from "../import-errors";

export type ImportFailure = { file: ScannedFile; reason: string };

export type BatchResult = {
	imported: number;
	failures: ImportFailure[];
	/** True when a cancel stopped the run before every selected file was tried. */
	cancelled: boolean;
};

export type RunImportOptions = {
	files: ScannedFile[];
	importFile: (file: ScannedFile) => Promise<unknown>;
	onProgress?: (progress: SequentialProgress) => void;
	/** Checked between books: the in-flight one always finishes and stays written. */
	isCancelled?: () => boolean;
};

export async function runBatchImport({
	files,
	importFile,
	onProgress,
	isCancelled,
}: RunImportOptions): Promise<BatchResult> {
	const result = await runSequential({
		items: files,
		run: importFile,
		label: (file) => file.name,
		describeError: importErrorMessage,
		onProgress,
		isCancelled,
	});

	return {
		imported: result.succeeded,
		failures: result.failures.map(({ item, reason }) => ({ file: item, reason })),
		cancelled: result.cancelled,
	};
}
