/**
 * Author matching keys. Gutenberg writes "Shelley, Mary Wollstonecraft", SE
 * writes "Mary Shelley"; both reduce to "mary shelley" (first given name +
 * last surname token), which is loose enough to bridge the two styles and
 * tight enough for a "more by this author" list.
 */

const PARTICLES = new Set(["of", "von", "van", "de", "der", "den", "du", "la", "le", "di", "da"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "saint", "sir", "lord", "lady", "graf"]);

function tokens(s: string): string[] {
	return s
		.replace(/\([^)]*\)/g, " ")
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^\p{L}\s-]/gu, " ")
		.split(/[\s-]+/)
		.filter((t) => t && !SUFFIXES.has(t));
}

/** Key for one author name in either "Last, First" or "First Last" form. */
export function authorKey(name: string): string | null {
	const commaAt = name.indexOf(",");
	let given: string[];
	let surname: string[];
	if (commaAt >= 0) {
		surname = tokens(name.slice(0, commaAt));
		const afterComma = name.slice(commaAt + 1).split(",")[0] ?? "";
		given = tokens(afterComma);
	} else {
		const all = tokens(name);
		surname = all.slice(-1);
		given = all.slice(0, -1);
	}
	const last = surname[surname.length - 1];
	if (!last) return null;
	const first = given.find((t) => !PARTICLES.has(t) && t.length > 0);
	return first ? `${first} ${last}` : last;
}

export function authorKeys(names: readonly string[]): string[] {
	const keys = names.map(authorKey).filter((k): k is string => k !== null);
	return [...new Set(keys)];
}

const ORPHAN_PART = /^(jr|sr|saint|sir|lord|lady|graf|baron|[ivx]+|.*\d.*)\.?$/i;

/**
 * Split a joined display string back into individual names. Only used where no
 * structured author list exists: the one-off backfill and the `author=` query
 * param. Gutenberg names carry a comma ("Dumas, Alexandre, Maquet, Auguste"),
 * so a single-token part followed by another part is read as "Last, First".
 */
export function splitAuthors(joined: string): string[] {
	const parts = joined
		.split(/,\s*/)
		.map((p) => p.trim())
		.filter(Boolean);
	const names: string[] = [];
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i] as string;
		const next = parts[i + 1];
		if (!part.includes(" ") && next !== undefined && !ORPHAN_PART.test(next)) {
			names.push(`${part}, ${next}`);
			i++;
			while (parts[i + 1] !== undefined && ORPHAN_PART.test(parts[i + 1] as string)) i++;
		} else if (!ORPHAN_PART.test(part)) {
			names.push(part);
		}
	}
	return names;
}
