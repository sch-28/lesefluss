import { Capacitor, registerPlugin } from "@capacitor/core";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { type BookFileFormat, bookFormatForFileName, type RawInput } from "@lesefluss/book-import";
import { openWebFilePicker, pickOrCancel } from "./pick-dialog";
import { MAX_IMPORT_BYTES, readNativeFile, readWebFile } from "./read-file";

/** One file found by the native walk, as it crosses the bridge. */
type ScanEntry = {
	relativePath: string;
	name: string;
	size: number;
	uri: string;
};

interface BookScannerPlugin {
	listFiles(options: { uri: string }): Promise<{ entries: ScanEntry[]; truncated: boolean }>;
}

const BookScanner = registerPlugin<BookScannerPlugin>("BookScanner");

/**
 * Where a scanned file's bytes can be fetched from later. Deliberately opaque
 * and cheap to hold: a batch keeps one of these per candidate book, and reading
 * them all up front would exhaust the WebView heap.
 */
export type ScannedFileHandle =
	| { kind: "uri"; uri: string }
	| { kind: "file"; file: File; mimeType?: string };

export type ScannedFile = {
	/**
	 * Unique within one scan. Not the path: a browser that ignores
	 * `webkitdirectory` reports every file's `webkitRelativePath` as empty, so a
	 * multi-select of two same-named files from different folders would collide.
	 */
	id: string;
	name: string;
	/** Path relative to the picked folder, e.g. `Pierce Brown/Morning Star.epub`. */
	relativePath: string;
	size: number;
	format: BookFileFormat;
	handle: ScannedFileHandle;
};

export type FolderScan = {
	files: ScannedFile[];
	/**
	 * The walk hit its depth or entry ceiling and stopped early, so `files` is a
	 * prefix of what the folder holds. Surfaced rather than swallowed: a batch
	 * that silently imported 20 000 of 30 000 books would look complete.
	 */
	truncated: boolean;
};

/**
 * Let the reader pick a folder and return every importable book inside it,
 * subfolders included. Nothing is read: each entry carries a handle instead.
 *
 * Throws `Error("CANCELLED")` if the picker is dismissed.
 */
export async function pickBookFolder(): Promise<FolderScan> {
	if (Capacitor.isNativePlatform()) {
		const { path } = await pickOrCancel(() => FilePicker.pickDirectory());
		if (!path) throw new Error("CANCELLED");
		const { entries, truncated } = await BookScanner.listFiles({ uri: path });
		return {
			files: toScannedFiles(
				entries.map((entry) => ({
					name: entry.name,
					relativePath: entry.relativePath,
					size: entry.size,
					handle: { kind: "uri", uri: entry.uri } as const,
				})),
			),
			truncated,
		};
	}

	const picked = await openWebFilePicker((input) => {
		input.multiple = true;
		input.webkitdirectory = true;
	});
	return {
		files: toScannedFiles(
			picked.map((file) => ({
				name: file.name,
				// Browsers that ignore `webkitdirectory` (mobile) leave this empty, in
				// which case the flat selection is the whole "folder".
				relativePath: file.webkitRelativePath || file.name,
				size: file.size,
				handle: { kind: "file", file, mimeType: file.type || undefined } as const,
			})),
		),
		truncated: false,
	};
}

type ScanCandidate = {
	name: string;
	relativePath: string;
	size: number;
	handle: ScannedFileHandle;
};

/**
 * Keep the importable candidates, in a stable order. The two platform paths
 * differ only in how they build a handle, so everything after that is shared.
 */
export function toScannedFiles(candidates: ScanCandidate[]): ScannedFile[] {
	return candidates
		.map((candidate, index) => {
			if (candidate.name.startsWith(".")) return null;
			const format = bookFormatForFileName(candidate.name);
			if (!format) return null;
			return { ...candidate, format, id: `${index}:${candidate.relativePath}` };
		})
		.filter((file): file is ScannedFile => file !== null)
		.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

/**
 * Read one scanned file's bytes. Callers run these one at a time and drop the
 * result before the next: a `RawInput` holds the whole file.
 *
 * Throws `Error("FILE_TOO_LARGE")` past the size cap or
 * `Error("FILE_READ_FAILED")` if the file is gone or unreadable.
 */
export async function readScannedFile(
	file: ScannedFile,
): Promise<Extract<RawInput, { kind: "bytes" }>> {
	if (file.size > MAX_IMPORT_BYTES) throw new Error("FILE_TOO_LARGE");
	const bytes =
		file.handle.kind === "uri"
			? await readNativeFile(file.handle.uri)
			: await readWebFile(file.handle.file);
	return {
		kind: "bytes",
		bytes,
		fileName: file.name,
		mimeType: file.handle.kind === "file" ? file.handle.mimeType : undefined,
	};
}
