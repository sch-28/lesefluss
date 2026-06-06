import { Capacitor } from "@capacitor/core";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import type { RawInput } from "@lesefluss/book-import";

/**
 * Upper bound on importable file size. `readData`-style whole-file base64
 * marshalling used to OOM the native bridge well before this; reading bytes
 * straight into the WebView raises the ceiling, but a truly huge file can still
 * exhaust the renderer heap, so reject it up front with a toast instead.
 */
const MAX_IMPORT_BYTES = 100 * 1024 * 1024;
const READ_TIMEOUT_MS = 60_000;

/**
 * Open a file picker (native or web) and return the selected file as a
 * `RawInput`. Throws `Error("CANCELLED")` if the user dismisses the picker,
 * `Error("FILE_TOO_LARGE")` past the size cap, or `Error("FILE_READ_FAILED")`
 * if the bytes can't be read.
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
		});
		if (!result.files || result.files.length === 0) throw new Error("CANCELLED");
		const file = result.files[0];
		if (file.size > MAX_IMPORT_BYTES) throw new Error("FILE_TOO_LARGE");
		if (!file.path) throw new Error("FILE_READ_FAILED");

		// Read inside the WebView. `readData: true` would base64-encode the whole
		// file into a single Java String on the bridge, OOMing the ART heap for
		// large files (the native OOM is swallowed and the import hangs forever).
		// `convertFileSrc` exposes the picker's content:// URI to `fetch`.
		const bytes = await fetchArrayBufferWithTimeout(
			Capacitor.convertFileSrc(file.path),
			READ_TIMEOUT_MS,
		);
		return {
			kind: "bytes",
			bytes,
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

async function fetchArrayBufferWithTimeout(url: string, timeoutMs: number): Promise<ArrayBuffer> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) throw new Error("FILE_READ_FAILED");
		return await res.arrayBuffer();
	} catch {
		throw new Error("FILE_READ_FAILED");
	} finally {
		clearTimeout(timer);
	}
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
			if (file.size > MAX_IMPORT_BYTES) return reject(new Error("FILE_TOO_LARGE"));
			const reader = new FileReader();
			reader.onload = () => {
				resolve({ name: file.name, bytes: reader.result as ArrayBuffer });
			};
			reader.onerror = () => reject(new Error("FILE_READ_FAILED"));
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
