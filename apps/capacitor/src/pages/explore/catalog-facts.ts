import { CATALOG_SOURCE_LABELS, type CatalogBook } from "../../services/catalog/client";
import { languageLabel } from "./language-label";

function authorYears(
	birth: number | null | undefined,
	death: number | null | undefined,
): string | null {
	if (birth && death) return `${birth}–${death}`;
	if (birth) return `b. ${birth}`;
	if (death) return `d. ${death}`;
	return null;
}

/** Badge facts for a catalog book besides its length; anything the catalog doesn't know is left out. */
export function catalogFacts(book: CatalogBook): string[] {
	const years = authorYears(book.authorBirthYear, book.authorDeathYear);
	return [
		book.language ? languageLabel(book.language) : null,
		CATALOG_SOURCE_LABELS[book.source] ?? null,
		years ? `Author ${years}` : null,
		book.epubUrl ? null : "No free EPUB",
	].filter((fact): fact is string => fact !== null);
}
