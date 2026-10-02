import { XMLParser } from "fast-xml-parser";

/** One Project Gutenberg ebook as the sync needs it, independent of where it was read from. */
export type GutenbergRecord = {
	id: number;
	title?: string;
	authors: { name: string; birthYear: number | null; deathYear: number | null }[];
	subjects: string[];
	bookshelves: string[];
	language?: string;
	summary?: string;
	epubUrl?: string;
	coverUrl?: string;
	downloadCount?: number;
	/** Size of the plain-text edition, the basis of the word-count estimate. */
	textBytes?: number;
	/** DCMI type; audio books are "Sound". */
	type?: string;
};

const REPEATED = new Set([
	"dcterms:creator",
	"dcterms:subject",
	"pgterms:bookshelf",
	"dcterms:hasFormat",
	"dcterms:language",
	"dcterms:format",
	"pgterms:marc520",
	"dcterms:title",
	"pgterms:agent",
]);

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	parseTagValue: false,
	trimValues: true,
	// PG's RDF writer encodes CR as `&#13;`; the default decodes only the five named XML entities.
	htmlEntities: true,
	isArray: (name) => REPEATED.has(name),
});

type Node = Record<string, unknown>;
const asArray = (v: unknown): Node[] =>
	v === undefined || v === null ? [] : Array.isArray(v) ? (v as Node[]) : [v as Node];

/** Text of an element that may carry attributes (`{ "#text": ..., "@_rdf:datatype": ... }`). */
function text(v: unknown): string | undefined {
	if (typeof v === "string") return v.trim() || undefined;
	if (typeof v === "number") return String(v);
	if (v && typeof v === "object" && "#text" in v) return text((v as Node)["#text"]);
	return undefined;
}

function int(v: unknown): number | null {
	const n = Number(text(v));
	return Number.isFinite(n) ? n : null;
}

/** `rdf:value` inside `rdf:Description`, with its vocabulary (`dcam:memberOf`). */
function described(node: Node): { value?: string; vocab?: string } {
	const desc = asArray(node["rdf:Description"])[0] ?? {};
	const member = asArray(desc["dcam:memberOf"])[0];
	return { value: text(desc["rdf:value"]), vocab: text(member?.["@_rdf:resource"]) };
}

/** Best first: EPUB 3 with images, falling back to the older EPUB 2 builds. */
const EPUB_SUFFIXES = [".epub3.images", ".epub.images", ".epub.noimages"];

/**
 * Byte size of the plain-text edition. PG's generated `ebooks/<id>.txt.utf-8`
 * comes first: every book has one with the same header and licence framing,
 * which is what the bytes-per-word factor was calibrated on.
 */
function plainTextBytes(fileNodes: Node[]): number | undefined {
	const texts = fileNodes
		.map((file) => ({
			url: String(file["@_rdf:about"] ?? ""),
			bytes: int(file["dcterms:extent"]),
			format: asArray(file["dcterms:format"])
				.map((f) => described(f).value ?? "")
				.find((f) => f.startsWith("text/plain")),
		}))
		.filter((t) => t.format && t.bytes);
	const best =
		texts.find((t) => t.url.endsWith(".txt.utf-8")) ??
		texts.find((t) => t.format?.includes("utf-8")) ??
		texts[0];
	return best?.bytes ?? undefined;
}

/**
 * Parse one `pg<id>.rdf` from Project Gutenberg's offline catalog. Null for
 * a file without an ebook node (the archive also holds a few non-book RDFs).
 */
export function parseGutenbergRdf(xml: string): GutenbergRecord | null {
	const doc = parser.parse(xml) as Node;
	const ebook = asArray((doc["rdf:RDF"] as Node | undefined)?.["pgterms:ebook"])[0];
	const id = Number(/ebooks\/(\d+)/.exec(String(ebook?.["@_rdf:about"] ?? ""))?.[1]);
	if (!ebook || !Number.isInteger(id)) return null;

	const authors = asArray(ebook["dcterms:creator"]).flatMap((c) =>
		asArray(c["pgterms:agent"]).flatMap((agent) => {
			const name = text(agent["pgterms:name"]);
			return name
				? [
						{
							name,
							birthYear: int(agent["pgterms:birthdate"]),
							deathYear: int(agent["pgterms:deathdate"]),
						},
					]
				: [];
		}),
	);

	// LCSH only: LCC call letters ("PR") are classification codes, not subjects.
	// Sorted so a reordered RDF doesn't count as a change.
	const subjects = asArray(ebook["dcterms:subject"])
		.map(described)
		.flatMap((s) => (s.value && s.vocab?.endsWith("/LCSH") ? [s.value] : []))
		.sort();
	const bookshelves = asArray(ebook["pgterms:bookshelf"])
		.flatMap((b) => described(b).value ?? [])
		.sort();

	const fileNodes = asArray(ebook["dcterms:hasFormat"]).flatMap((f) => asArray(f["pgterms:file"]));
	const files = fileNodes.map((file) => String(file["@_rdf:about"] ?? ""));
	const epubUrl = EPUB_SUFFIXES.map((suffix) => files.find((u) => u.endsWith(suffix))).find(
		Boolean,
	);
	const coverUrl = files.find((u) => u.endsWith(".cover.medium.jpg"));

	const titleText = text(asArray(ebook["dcterms:title"])[0]);
	const type = described(asArray(ebook["dcterms:type"])[0] ?? {}).value;

	return {
		id,
		// Multi-line titles put the subtitle on its own line.
		title: titleText?.replace(/\s*[\r\n]+\s*/g, ": "),
		authors,
		subjects,
		bookshelves,
		language: described(asArray(ebook["dcterms:language"])[0] ?? {}).value,
		summary: text(asArray(ebook["pgterms:marc520"])[0]),
		epubUrl,
		coverUrl,
		downloadCount: int(ebook["pgterms:downloads"]) ?? undefined,
		textBytes: plainTextBytes(fileNodes),
		type,
	};
}
