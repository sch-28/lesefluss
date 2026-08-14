import { Capacitor } from "@capacitor/core";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { BOOK_FILE_EXTENSIONS, type RawInput } from "@lesefluss/book-import";
import { openWebFilePicker, pickOrCancel } from "./pick-dialog";
import { MAX_IMPORT_BYTES, readNativeFile, readWebFile } from "./read-file";

/**
 * Open a file picker (native or web) and return the selected file as a
 * `RawInput`. Throws `Error("CANCELLED")` if the user dismisses the picker,
 * `Error("FILE_TOO_LARGE")` past the size cap, or `Error("FILE_READ_FAILED")`
 * if the bytes can't be read.
 */
export async function pickFileFromPicker(): Promise<RawInput> {
	if (Capacitor.isNativePlatform()) {
		const result = await pickOrCancel(() =>
			FilePicker.pickFiles({
				// The native picker filters by mime type, not by extension, so this
				// list cannot come from BOOK_FILE_EXTENSIONS.
				types: [
					"text/plain",
					"text/markdown",
					"application/epub+zip",
					"text/html",
					"application/pdf",
				],
				limit: 1,
			}),
		);
		if (!result.files || result.files.length === 0) throw new Error("CANCELLED");
		const file = result.files[0];
		if (file.size > MAX_IMPORT_BYTES) throw new Error("FILE_TOO_LARGE");
		if (!file.path) throw new Error("FILE_READ_FAILED");

		return {
			kind: "bytes",
			bytes: await readNativeFile(file.path),
			fileName: file.name,
			mimeType: file.mimeType,
		};
	}

	const [file] = await openWebFilePicker((input) => {
		input.accept = BOOK_FILE_EXTENSIONS.map((ext) => `.${ext}`).join(",");
	});
	if (file.size > MAX_IMPORT_BYTES) throw new Error("FILE_TOO_LARGE");
	return {
		kind: "bytes",
		bytes: await readWebFile(file),
		fileName: file.name,
	};
}
