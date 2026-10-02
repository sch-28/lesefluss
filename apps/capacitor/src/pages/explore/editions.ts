import type { CatalogSearchResult } from "../../services/catalog/client";

function words(s: string): string[] {
	return s
		.replace(/\([^)]*\)/g, " ")
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^\p{L}\s]/gu, " ")
		.split(/\s+/)
		.filter(Boolean);
}

/** First given name + surname, whichever way round the name is written; mirrors the catalog's author key. */
function authorKey(author: string | null | undefined): string {
	const raw = author?.trim() ?? "";
	// "Shelley, Mary" is one inverted name; "Mary Shelley, Percy Shelley" is a list.
	const isInverted = /^[^,\s]+, [^,]+$/.test(raw);
	const first = isInverted ? raw : (raw.split(/,\s*|;|&| and /)[0] ?? "");
	const commaAt = first.indexOf(",");
	const [surname, given] =
		commaAt >= 0
			? [words(first.slice(0, commaAt)), words(first.slice(commaAt + 1))]
			: [words(first).slice(-1), words(first).slice(0, -1)];
	return [given[0], surname[surname.length - 1]].filter(Boolean).join(" ");
}

/**
 * Same work, any edition: Gutenberg often carries several, and Standard Ebooks
 * may have another ("Frankenstein; Or, The Modern Prometheus" / "Frankenstein").
 */
export function editionKey(title: string, author: string | null | undefined): string {
	const head = title.split(/[:;]/)[0]?.trim().toLowerCase() ?? "";
	return `${head}|${authorKey(author)}`;
}

/** First of each work, in the given order. */
export function collapseEditions(results: readonly CatalogSearchResult[]): CatalogSearchResult[] {
	const seen = new Set<string>();
	return results.filter((r) => {
		const key = editionKey(r.title, r.author);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
