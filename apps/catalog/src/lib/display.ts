import { splitAuthors } from "./authors.js";

/**
 * Gutenberg's catalog passes some titles through with raw MARC subfield markers
 * ("Ancient law : $b its connection…"); render them as a plain subtitle.
 */
export function cleanTitle(title: string): string {
	return title.replace(/\s*:?\s*\$[a-z]\s+/g, ": ").trim();
}

/** SQL twin of `cleanTitle`, for rows synced before it existed. */
export const MARC_SUBFIELD_SQL_PATTERN = "\\s*:?\\s*\\$[a-z]\\s+";

/**
 * "Last, First" per author, as Gutenberg stores it, to "First Last" for display.
 * A parenthetical expansion of initials is the fuller given name, so it wins:
 * "Wells, H. G. (Herbert George)" shows as "Herbert George Wells".
 */
function displayName(name: string): string {
	const [last, given] = name.split(/,\s*/);
	if (!given) return name;
	const expanded = /\(([^)]+)\)/.exec(given)?.[1]?.trim();
	return `${expanded ?? given.trim()} ${last}`;
}

/**
 * Display form of the stored author string. Search and author keys keep
 * working off the stored form; this only changes what clients show.
 */
export function displayAuthor(author: string | null, source: string): string | null {
	if (!author || source !== "gutenberg") return author;
	return splitAuthors(author).map(displayName).join(", ");
}
