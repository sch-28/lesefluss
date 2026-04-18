import { importBookFromBlob } from "../book-import";
import { queries } from "../db/queries";
import type { Book } from "../db/schema";
import {
	type CatalogBook,
	type CatalogSource,
	downloadCatalogEpub,
	getCatalogBook,
} from "./client";

/** Slugify a title for a filename. */
function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
}

const VALID_SOURCES: readonly CatalogSource[] = ["gutenberg", "standard_ebooks"];

function normaliseSource(source: CatalogBook["source"]): CatalogSource {
	if (VALID_SOURCES.includes(source)) return source;
	throw new Error(`Unknown catalog source: ${source}`);
}

export type CatalogImportResult = {
	book: Book;
	existed: boolean;
};

/**
 * Import a catalog book into the local library. If a book with matching
 * `catalogId` already exists locally, return it without re-downloading.
 */
export async function importFromCatalog(
	catalogId: string,
	onProgress?: (pct: number) => void,
): Promise<CatalogImportResult> {
	// Idempotency: short-circuit if we already have this catalog book locally.
	const existing = await queries.getBookByCatalogId(catalogId);
	if (existing) return { book: existing, existed: true };

	const meta = await getCatalogBook(catalogId);
	if (!meta.epubUrl) throw new Error("This book is not available as a free EPUB.");

	// Download phase: 0–80% of combined progress. Parse: 80–100%.
	const blob = await downloadCatalogEpub(catalogId, (pct) => onProgress?.(Math.round(pct * 0.8)));

	const filename = `${slugify(meta.title) || "book"}.epub`;
	const book = await importBookFromBlob(
		blob,
		filename,
		(pct) => onProgress?.(80 + Math.round(pct * 0.2)),
		{ source: normaliseSource(meta.source), catalogId: meta.id },
	);

	return { book, existed: false };
}
