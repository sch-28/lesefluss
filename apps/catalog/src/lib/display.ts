import { type SQL, sql } from "drizzle-orm";
import { splitAuthors } from "./authors.js";

/**
 * Gutenberg's catalog passes some titles through with raw MARC subfield markers
 * ("Ancient law : $b its connection…", "Dress design $b: an account…"); render
 * them as a plain subtitle. Rules apply in order and are written once for both
 * `cleanTitle` and the SQL that cleans stored rows: a marker with its own
 * colon or semicolon keeps that punctuation, a bare one becomes ": ", a
 * trailing one goes.
 */
export const MARC_SUBFIELD_RULES = [
	{ pattern: "\\s*[:;]?\\s*\\$[a-z]\\s*([:;])\\s*", js: "$1 ", sql: "\\1 " },
	{ pattern: "\\s*:?\\s*\\$[a-z]\\s+(?=\\S)", js: ": ", sql: ": " },
	{ pattern: "\\s*[:;]?\\s*\\$[a-z]\\s*$", js: "", sql: "" },
] as const;

/** Matches a title any rule would change. */
export const MARC_SUBFIELD_SQL_PATTERN = MARC_SUBFIELD_RULES.map((r) => `(${r.pattern})`).join("|");

/** `cleanTitle` in SQL, for rows stored before a rule existed. */
export function cleanTitleSql(column: SQL): SQL {
	const replaced = MARC_SUBFIELD_RULES.reduce(
		(expr, rule) => sql`regexp_replace(${expr}, ${rule.pattern}, ${rule.sql}, 'g')`,
		column,
	);
	return sql`btrim(${replaced})`;
}

export function cleanTitle(title: string): string {
	return MARC_SUBFIELD_RULES.reduce(
		(t, rule) => t.replace(new RegExp(rule.pattern, "g"), rule.js),
		title,
	).trim();
}

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
