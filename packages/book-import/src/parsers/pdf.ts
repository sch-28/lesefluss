import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { BookPayload, Chapter, Parser, PdfjsModuleLike } from "../types";
import { utf8ByteLength } from "../utils/encoding";
import { assertBytes } from "../utils/raw-input";
import { canParsePdf } from "./matchers";

/**
 * Error codes surfaced to the UI (handled by `use-library-imports`):
 *   PDF_ENCRYPTED — password-protected, not supported in V1.
 *   PDF_NO_TEXT   — scanned PDFs with no text layer; OCR not supported.
 */

export const pdfParser: Parser = {
	id: "pdf",

	canParse: canParsePdf,

	async parse(input, onProgress, options): Promise<BookPayload> {
		assertBytes(input);
		const pdfjs = await loadPdfjs(options?.loadPdfjs);

		let doc: PDFDocumentProxy;
		try {
			// Defensive clone: pdfjs may detach or retain the ArrayBuffer
			// internally. We pass `input.bytes` unchanged to `payload.original`
			// so the original file can be persisted to disk — sharing it with
			// pdfjs risks a detached buffer by the time commit reads it.
			const copy = input.bytes.slice(0, input.bytes.byteLength);
			doc = (await pdfjs.getDocument({ data: copy }).promise) as PDFDocumentProxy;
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

let defaultPdfjsPromise: Promise<PdfjsModuleLike> | null = null;
const injectedPdfjsPromises = new WeakMap<
	() => Promise<PdfjsModuleLike>,
	Promise<PdfjsModuleLike>
>();

/**
 * Dynamically import pdfjs so the PDF parser is excluded from the main chunk.
 * Browser consumers can inject a loader that also configures their bundler's
 * worker strategy before returning the module.
 *
 * On rejection, the cache is cleared so the next call retries — otherwise
 * a transient failure (worker file missing from the cache, network hiccup
 * on the first import) would stick for the entire session.
 */
function loadPdfjs(loader?: () => Promise<PdfjsModuleLike>): Promise<PdfjsModuleLike> {
	if (loader) {
		const cached = injectedPdfjsPromises.get(loader);
		if (cached) return cached;
		const promise = loader().catch((err) => {
			injectedPdfjsPromises.delete(loader);
			throw err;
		});
		injectedPdfjsPromises.set(loader, promise);
		return promise;
	}

	if (!defaultPdfjsPromise) {
		defaultPdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").catch((err) => {
			defaultPdfjsPromise = null;
			throw err;
		});
	}
	return defaultPdfjsPromise;
}

function isPasswordError(err: unknown): boolean {
	// PasswordException is thrown when a PDF requires a password. The class
	// name is the most reliable detector across pdfjs minor versions.
	if (!err || typeof err !== "object") return false;
	const name = (err as { name?: unknown }).name;
	return name === "PasswordException";
}

// ─── Page text extraction ──────────────────────────────────────────────────

/** Fraction of item height within which two items are considered the same line. */
const LINE_Y_TOLERANCE = 0.5;
/** Multiplier on median line height above which we emit a paragraph break. */
const PARAGRAPH_GAP_FACTOR = 1.5;
/** Cover render target width in CSS px. Page 1 is rendered to this width. */
const COVER_WIDTH_PX = 200;
/** JPEG quality for the cover data URL. */
const COVER_JPEG_QUALITY = 0.75;

/**
 * Turn a single PDF page's positioned glyph runs into plain text with soft
 * line-wrapping reflowed and paragraph boundaries preserved.
 *
 * V1 assumes single-column body text — multi-column layouts will interleave.
 * Follow-up PR can cluster items by x-coordinate bands before line grouping.
 */
async function extractPageText(page: PDFPageProxy): Promise<string> {
	const { items } = await page.getTextContent();
	// `items` also contains marked-content objects (no `str`/`transform`); filter them.
	const textItems = items.filter((it): it is TextItem => "str" in it && "transform" in it);
	if (textItems.length === 0) return "";

	// Group into lines. PDF y-coordinates grow upward, so -y sorts top → bottom.
	// Tolerance uses per-item height because font sizes vary within a page.
	type Line = { y: number; height: number; items: TextItem[] };
	const lines: Line[] = [];
	for (const item of textItems) {
		const y = item.transform[5];
		const height = item.height || 1;
		const existing = lines.find(
			(l) => Math.abs(l.y - y) <= Math.max(l.height, height) * LINE_Y_TOLERANCE,
		);
		if (existing) {
			existing.items.push(item);
			// Track max height seen on the line for subsequent tolerance checks.
			if (height > existing.height) existing.height = height;
		} else {
			lines.push({ y, height, items: [item] });
		}
	}
	lines.sort((a, b) => b.y - a.y); // top first

	// Flatten each line into a string, sorting glyph runs left-to-right.
	const lineStrings = lines.map((line) => {
		line.items.sort((a, b) => a.transform[4] - b.transform[4]);
		return line.items
			.map((it) => it.str)
			.join("")
			.replace(/\s+/g, " ")
			.trim();
	});

	// Compute inter-line gaps for paragraph detection.
	const lineHeights = lines.map((l) => l.height).filter((h) => h > 0);
	const medianLineHeight = median(lineHeights) || 12;
	const paragraphThreshold = medianLineHeight * PARAGRAPH_GAP_FACTOR;

	let out = "";
	for (let i = 0; i < lineStrings.length; i++) {
		const current = lineStrings[i];
		if (!current) continue;

		if (i === 0) {
			out = current;
			continue;
		}

		const gap = lines[i - 1].y - lines[i].y;
		const isParagraphBreak = gap > paragraphThreshold;

		if (isParagraphBreak) {
			out += `\n\n${current}`;
			continue;
		}

		// Soft-wrap reflow. Hyphenated line-break: drop the hyphen and join.
		if (out.endsWith("-") && /^[a-z]/.test(current)) {
			out = `${out.slice(0, -1)}${current}`;
		} else {
			out += ` ${current}`;
		}
	}

	return out.trim();
}

type OutlineNode = {
	title: string;
	dest: string | unknown[] | null;
	items: OutlineNode[];
};

/**
 * Map the PDF's outline (bookmarks) to `Chapter[]` keyed by UTF-8 byte
 * offsets in the concatenated `content` string the parser builds.
 */
async function extractChapters(
	doc: PDFDocumentProxy,
	pageTexts: string[],
): Promise<Chapter[] | null> {
	const outline = (await doc.getOutline().catch(() => null)) as OutlineNode[] | null;
	if (!outline || outline.length === 0) return null;

	const pageOffsets: number[] = new Array(pageTexts.length);
	let cumulative = 0;
	for (let i = 0; i < pageTexts.length; i++) {
		pageOffsets[i] = cumulative;
		cumulative += utf8ByteLength(pageTexts[i]) + (i < pageTexts.length - 1 ? 2 : 0);
	}

	const chapters: Chapter[] = [];
	const visit = async (node: OutlineNode): Promise<void> => {
		const pageIndex = await resolvePageIndex(doc, node.dest);
		if (pageIndex !== null && pageIndex >= 0 && pageIndex < pageOffsets.length) {
			const title = node.title?.trim();
			if (title) chapters.push({ title, startByte: pageOffsets[pageIndex] });
		}
		for (const child of node.items ?? []) await visit(child);
	};
	for (const node of outline) await visit(node);

	if (chapters.length === 0) return null;

	chapters.sort((a, b) => a.startByte - b.startByte);
	const deduped: Chapter[] = [];
	for (const ch of chapters) {
		if (deduped.length === 0 || deduped[deduped.length - 1].startByte !== ch.startByte) {
			deduped.push(ch);
		}
	}
	return deduped;
}

async function resolvePageIndex(
	doc: PDFDocumentProxy,
	dest: OutlineNode["dest"],
): Promise<number | null> {
	if (!dest) return null;
	try {
		const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
		if (!Array.isArray(explicit) || explicit.length === 0) return null;
		const ref = explicit[0];
		return await doc.getPageIndex(ref as { num: number; gen: number });
	} catch {
		return null;
	}
}

/** Render page 1 to a cover data URL. Cover extraction is best-effort. */
async function renderCover(doc: PDFDocumentProxy): Promise<string | null> {
	try {
		const page = await doc.getPage(1);
		const base = page.getViewport({ scale: 1 });
		const scale = COVER_WIDTH_PX / base.width;
		const viewport = page.getViewport({ scale });

		const canvas = document.createElement("canvas");
		canvas.width = Math.ceil(viewport.width);
		canvas.height = Math.ceil(viewport.height);
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;

		await page.render({ canvasContext: ctx, viewport, canvas }).promise;
		return canvas.toDataURL("image/jpeg", COVER_JPEG_QUALITY);
	} catch {
		return null;
	}
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
