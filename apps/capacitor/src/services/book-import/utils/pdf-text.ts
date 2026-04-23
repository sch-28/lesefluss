import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { Chapter } from "../../db/schema";
import { utf8ByteLength } from "./encoding";

// ─── Tunables ──────────────────────────────────────────────────────────────

/** Fraction of item height within which two items are considered the same line. */
const LINE_Y_TOLERANCE = 0.5;
/** Multiplier on median line height above which we emit a paragraph break. */
const PARAGRAPH_GAP_FACTOR = 1.5;
/** Cover render target width in CSS px. Page 1 is rendered to this width. */
const COVER_WIDTH_PX = 200;
/** JPEG quality for the cover data URL. */
const COVER_JPEG_QUALITY = 0.75;

// ─── Page text extraction ──────────────────────────────────────────────────

/**
 * Turn a single PDF page's positioned glyph runs into plain text with soft
 * line-wrapping reflowed and paragraph boundaries preserved.
 *
 * V1 assumes single-column body text — multi-column layouts will interleave.
 * Follow-up PR can cluster items by x-coordinate bands before line grouping.
 */
export async function extractPageText(page: PDFPageProxy): Promise<string> {
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

// ─── Chapters from outline ─────────────────────────────────────────────────

type OutlineNode = {
	title: string;
	dest: string | unknown[] | null;
	items: OutlineNode[];
};

/**
 * Map the PDF's outline (bookmarks) to `Chapter[]` keyed by UTF-8 byte
 * offsets in the concatenated `content` string the parser builds.
 *
 * Returns `null` if the PDF has no outline or resolution fails entirely.
 * Entries whose destination can't be resolved are skipped; the rest are
 * returned sorted by offset and deduped.
 */
export async function extractChapters(
	doc: PDFDocumentProxy,
	pageTexts: string[],
): Promise<Chapter[] | null> {
	const outline = (await doc.getOutline().catch(() => null)) as OutlineNode[] | null;
	if (!outline || outline.length === 0) return null;

	// Byte offsets where each page's text starts in the joined content.
	// Page join separator is "\n\n" = 2 UTF-8 bytes.
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

	// Sort by offset, dedup identical offsets (outlines sometimes repeat pages).
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
		// Page ref shape: { num, gen } from pdfjs. `getPageIndex` handles it.
		return await doc.getPageIndex(ref as { num: number; gen: number });
	} catch {
		return null;
	}
}

// ─── Cover rendering ───────────────────────────────────────────────────────

/**
 * Render page 1 to an offscreen canvas and return it as a base64 JPEG data
 * URL. Returns null on any failure — cover is nice-to-have, never fatal.
 */
export async function renderCover(doc: PDFDocumentProxy): Promise<string | null> {
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

// ─── Helpers ───────────────────────────────────────────────────────────────

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
