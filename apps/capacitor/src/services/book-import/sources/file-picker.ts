import { Capacitor } from "@capacitor/core";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { base64ToArrayBuffer, type RawInput } from "@lesefluss/book-import";

/**
 * Open a file picker (native or web) and return the selected file as a
 * `RawInput`. Throws `Error("CANCELLED")` if the user dismisses the picker.
 */
export async function pickFileFromPicker(): Promise<RawInput> {
	if (Capacitor.isNativePlatform()) {
		const result = await FilePicker.pickFiles({
			types: [
				"text/plain",
				"text/markdown",
				"application/epub+zip",
				"text/html",
				"application/pdf",
			],
			limit: 1,
			readData: true,
		});
		if (!result.files || result.files.length === 0) throw new Error("CANCELLED");
		const file = result.files[0];
		if (!file.data) throw new Error("File data is missing");
		return {
			kind: "bytes",
			bytes: base64ToArrayBuffer(file.data),
			fileName: file.name,
			mimeType: file.mimeType,
		};
	}

	const picked = await pickFileWeb();
	return {
		kind: "bytes",
		bytes: picked.bytes,
		fileName: picked.name,
	};
}

/**
 * Web fallback: use HTML5 file input to pick a file. Returns the file name and
 * raw bytes.
 */
function pickFileWeb(): Promise<{ name: string; bytes: ArrayBuffer }> {
	return new Promise((resolve, reject) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".txt,.md,.epub,.html,.htm,.pdf";
		let picked = false;
		input.onchange = () => {
			picked = true;
			const file = input.files?.[0];
			if (!file) return reject(new Error("CANCELLED"));
			const reader = new FileReader();
			reader.onload = () => {
				resolve({ name: file.name, bytes: reader.result as ArrayBuffer });
			};
			reader.onerror = () => reject(new Error("Failed to read file"));
			reader.readAsArrayBuffer(file);
		};
		// Detect cancel: window regains focus but no file was picked
		window.addEventListener(
			"focus",
			() => {
				setTimeout(() => {
					if (!picked) reject(new Error("CANCELLED"));
				}, 300);
			},
			{ once: true },
		);
		input.click();
	});
}
