/**
 * Turns raw catalog subjects into one tag vocabulary shared by both sources.
 *
 * Gutenberg subjects are Library of Congress headings ("Short stories, English",
 * "England -- Social life and customs -- Fiction"); Standard Ebooks mixes its
 * own labels ("Shorts", "Science Fiction") with LCSH. Raw subjects stay on the
 * row for display; tags are what clients filter and browse by.
 */

export type Tag = { id: string; label: string };

const NATIONALITIES = new Set([
	"american",
	"australian",
	"austrian",
	"belgian",
	"brazilian",
	"british",
	"canadian",
	"chinese",
	"czech",
	"danish",
	"dutch",
	"english",
	"finnish",
	"flemish",
	"french",
	"german",
	"greek",
	"hungarian",
	"icelandic",
	"indic",
	"irish",
	"italian",
	"japanese",
	"latin",
	"mexican",
	"norwegian",
	"old english",
	"polish",
	"portuguese",
	"russian",
	"scottish",
	"spanish",
	"swedish",
	"swiss",
	"welsh",
]);

/** Heads that read as a form once a leading nationality is removed ("English poetry"). */
const FORM_NOUNS = new Set([
	"ballads",
	"drama",
	"essays",
	"fiction",
	"letters",
	"literature",
	"periodicals",
	"poetry",
	"prose literature",
	"short stories",
	"wit and humor",
]);

/**
 * LCSH form subdivisions worth a tag of their own. "Orphans -- Juvenile fiction"
 * says both "about orphans" and "children's book"; the head carries the first.
 */
const FORM_SUBDIVISIONS: Record<string, string> = {
	fiction: "fiction",
	"juvenile fiction": "childrens",
	"juvenile literature": "childrens",
	"juvenile poetry": "childrens",
	biography: "biography",
	drama: "drama",
	poetry: "poetry",
	humor: "humor",
	"description and travel": "travel",
	correspondence: "letters",
};

type Canonical = { id: string; label: string; aliases: readonly string[] };

/** Aliases are slugs of the cleaned heading, so case and punctuation never matter. */
const CANONICAL: readonly Canonical[] = [
	{ id: "short-stories", label: "Short stories", aliases: ["shorts", "short-fiction"] },
	{
		id: "mystery",
		label: "Mystery & detective",
		aliases: [
			"detective-and-mystery-stories",
			"mystery-and-detective-stories",
			"mystery-fiction",
			"detective-fiction",
		],
	},
	{ id: "fantasy", label: "Fantasy", aliases: ["fantasy-fiction", "fantasy-literature"] },
	{ id: "horror", label: "Horror", aliases: ["horror-tales", "horror-fiction", "horror-stories"] },
	{ id: "gothic-fiction", label: "Gothic fiction", aliases: ["gothic"] },
	{
		id: "adventure",
		label: "Adventure",
		aliases: ["adventure-stories", "adventure-and-adventurers", "adventure-fiction"],
	},
	{ id: "romance", label: "Romance", aliases: ["love-stories", "romance-fiction"] },
	{
		id: "childrens",
		label: "Children's",
		aliases: ["childrens-stories", "childrens-literature", "childrens-poetry"],
	},
	{
		id: "humor",
		label: "Humor",
		aliases: ["humorous-stories", "wit-and-humor", "humorous-fiction"],
	},
	{ id: "comedy", label: "Comedy", aliases: ["comedies", "comedy-plays"] },
	{ id: "tragedy", label: "Tragedy", aliases: ["tragedies", "tragedies-drama"] },
	{ id: "travel", label: "Travel", aliases: ["voyages-and-travels", "travel-writing"] },
	{ id: "poetry", label: "Poetry", aliases: ["poems"] },
	{ id: "drama", label: "Drama", aliases: ["plays"] },
	{ id: "science-fiction", label: "Science fiction", aliases: [] },
	{ id: "westerns", label: "Westerns", aliases: ["western-stories"] },
	{ id: "letters", label: "Letters", aliases: [] },
	{ id: "fiction", label: "Fiction", aliases: [] },
	{ id: "biography", label: "Biography", aliases: [] },
];

const BY_SLUG = new Map<string, Tag>();
for (const c of CANONICAL) {
	const tag = { id: c.id, label: c.label };
	BY_SLUG.set(c.id, tag);
	for (const a of c.aliases) BY_SLUG.set(a, tag);
}

const CHARACTER_HEADING = /\((fictitious|legendary|mythical|mythological) character\)/i;
/**
 * LCSH personal names: "Shakespeare, William, 1564-1616", "Napoleon I, Emperor
 * of the French, 1769-1821" (two or more parts before the life dates; one part
 * plus dates is an event, "Napoleonic Wars, 1800-1815"), or a parenthetical
 * full name, "Murdock, Charles A. (Charles Albert)". A person is a subject,
 * not a kind of book.
 */
const PERSONAL_NAME =
	/^[^,]+, [^,]+(?:, [^,]+)*, (?:ca\. |-)?\d{3,4}\??(?:-|$)|^[^,]+, [^,(]+\([A-Z][^)]*\)$/;
/**
 * Cities and regions carry a place qualifier ("London (England)", "Boston
 * (Mass.)", "Cornwall (England : County)") or an inverted compass point
 * ("Africa, Central"); countries come bare and stay.
 */
const LOCAL_PLACE =
	/\((?:[^)]*[.:,][^)]*|State|Province|Syria|Niger|Egypt|Turkey|Persia|Iran|Iraq|Israel|Palestine|Mexico|Peru|Chile|Brazil|Argentina|England|Scotland|Wales|Ireland|France|Italy|Germany|Spain|Russia|India|China|Japan|Greece|Canada|Australia)\)$|, (?:North|South|East|West|Central|Northern|Southern|Eastern|Western)$/;
const ERA_QUALIFIER = /^(\d|.*\bcentury\b|.*\bdynasty\b|ancient|medieval|modern)/i;

export function slugify(s: string): string {
	return s
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/œ/g, "oe")
		.replace(/æ/g, "ae")
		.replace(/ß/g, "ss")
		.replace(/['’]/g, "")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** Dates here name the war, not an era, so stripping them would merge the two. */
const WORLD_WARS: Record<string, string> = {
	"world war, 1914-1918": "World War I",
	"world war, 1939-1945": "World War II",
};

function stripQualifiers(head: string): string {
	const war = WORLD_WARS[head.toLowerCase()];
	if (war) return war;
	let parts = head.split(/,\s+/);
	while (parts.length > 1) {
		const last = (parts[parts.length - 1] ?? "").toLowerCase();
		if (!NATIONALITIES.has(last) && !ERA_QUALIFIER.test(last)) break;
		parts = parts.slice(0, -1);
	}
	let out = parts.join(", ").replace(/\s*\((drama|poetry|fiction)\)$/i, "");

	const lower = out.toLowerCase();
	for (const nat of NATIONALITIES) {
		if (!lower.startsWith(`${nat} `)) continue;
		const rest = out.slice(nat.length + 1);
		if (FORM_NOUNS.has(rest.toLowerCase())) out = rest;
		break;
	}
	return out;
}

function toTag(label: string): Tag | null {
	const slug = slugify(label);
	if (!slug) return null;
	const canonical = BY_SLUG.get(slug);
	if (canonical) return canonical;
	return { id: slug, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

export function normalizeSubject(raw: string): Tag[] {
	// Some records omit the spaces around "--" or append the vocabulary name.
	const cleaned = raw.replace(/\s*\((?:LCSH|lcsh)\)\s*$/, "");
	const [rawHead, ...subdivisions] = cleaned.split(/\s*--\s*/).map((s) => s.trim());
	const out: Tag[] = [];

	if (rawHead && !CHARACTER_HEADING.test(rawHead) && !PERSONAL_NAME.test(rawHead)) {
		const head = stripQualifiers(rawHead);
		const tag = LOCAL_PLACE.test(head) ? null : toTag(head);
		if (tag) out.push(tag);
	}
	for (const sub of subdivisions) {
		const formId = FORM_SUBDIVISIONS[sub.toLowerCase()];
		const tag = formId ? BY_SLUG.get(formId) : undefined;
		if (tag) out.push(tag);
	}
	return out;
}

/** Deduplicated tags for a book, in first-seen order. */
export function normalizeSubjects(subjects: readonly string[] | null | undefined): Tag[] {
	const seen = new Map<string, Tag>();
	for (const s of subjects ?? []) {
		for (const tag of normalizeSubject(s)) {
			if (!seen.has(tag.id)) seen.set(tag.id, tag);
		}
	}
	return [...seen.values()];
}

export const TAG_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Tag ids for a row plus the labels they need in `catalog_tags`. Always an
 * array: NULL is reserved for "not normalized yet", which the backfill selects on.
 */
export function tagsFor(subjects: readonly string[] | null | undefined): {
	ids: string[];
	tags: Tag[];
} {
	const tags = normalizeSubjects(subjects);
	return { ids: tags.map((t) => t.id), tags };
}
