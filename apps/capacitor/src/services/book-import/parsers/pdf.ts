import type { PDFDocumentProxy } from "pdfjs-dist";
import type { BookPayload, Parser } from "../types";
import { extractChapters, extractPageText, renderCover } from "../utils/pdf-text";
import { assertBytes } from "../utils/raw-input";

/**
 * Error codes surfaced to the UI (handled by `use-library-imports`):
 *   PDF_ENCRYPTED — password-protected, not supported in V1.
 *   PDF_NO_TEXT   — scanned PDFs with no text layer; OCR not supported.
 */

export const pdfParser: Parser = {
	id: "pdf",

	canParse(input) {
		if (input.kind !== "bytes") return false;
		if (input.fileName.toLowerCase().endsWith(".pdf")) return true;
		return input.mimeType === "application/pdf";
	},

	async parse(input, onProgress): Promise<BookPayload> {
		assertBytes(input);
		const pdfjs = await loadPdfjs();

		let doc: PDFDocumentProxy;
		try {
			// Defensive clone: pdfjs may detach or retain the ArrayBuffer
			// internally. We pass `input.bytes` unchanged to `payload.original`
			// so the original file can be persisted to disk — sharing it with
			// pdfjs risks a detached buffer by the time commit reads it.
			const copy = input.bytes.slice(0, input.bytes.byteLength);
			doc = await pdfjs.getDocument({ data: copy }).promise;
		} catch (err) {
			if (isPasswordError(err)) throw new Error("PDF_ENCRYPTED");
			throw err;
		}

		try {
			const meta = await doc.getMetadata().catch(() => null);
			const info = (meta?.info ?? {}) as { Title?: string; Author?: string };
			const title = info.Title?.trim() || input.fileName.replace(/\.pdf$/i, "");
			const author = info.Author?.trim() || null;

			// Text extraction, per page. Reserve 5% of the progress bar for the
			// cover render + chapter resolution that happen after the loop.
			const pageTexts: string[] = [];
			for (let i = 1; i <= doc.numPages; i++) {
				const page = await doc.getPage(i);
				const text = await extractPageText(page);
				pageTexts.push(text);
				page.cleanup();
				onProgress?.(Math.round((i / doc.numPages) * 95));
			}

			const content = pageTexts.join("\n\n").trim();
			if (!content) throw new Error("PDF_NO_TEXT");

			// Both only read from the loaded doc — run together. Either can fail
			// independently without aborting the import; chapters surface null,
			// the cover returns null via its own catch.
			const [chapters, coverImage] = await Promise.all([
				extractChapters(doc, pageTexts).catch(() => null),
				renderCover(doc),
			]);
			onProgress?.(100);

			return {
				content,
				title,
				author,
				coverImage,
				chapters,
				fileFormat: "pdf",
				original: { bytes: input.bytes, extension: "pdf" },
			};
		} finally {
			await doc.destroy().catch(() => undefined);
		}
	},
};

// ─── Lazy pdfjs loader ─────────────────────────────────────────────────────

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/**
 * Dynamically import pdfjs + its worker so the ~500KB bundle is excluded
 * from the main chunk. The first PDF import pays the load cost; subsequent
 * imports in the same session reuse the cached promise.
 *
 * On rejection, the cache is cleared so the next call retries — otherwise
 * a transient failure (worker file missing from the cache, network hiccup
 * on the first import) would stick for the entire session.
 */
function loadPdfjs(): Promise<PdfjsModule> {
	if (!pdfjsPromise) {
		pdfjsPromise = (async () => {
			const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
			const { default: Worker } = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?worker");
			mod.GlobalWorkerOptions.workerPort = new Worker();
			return mod;
		})().catch((err) => {
			pdfjsPromise = null;
			throw err;
		});
	}
	return pdfjsPromise;
}

function isPasswordError(err: unknown): boolean {
	// PasswordException is thrown when a PDF requires a password. The class
	// name is the most reliable detector across pdfjs minor versions.
	if (!err || typeof err !== "object") return false;
	const name = (err as { name?: unknown }).name;
	return name === "PasswordException";
}
