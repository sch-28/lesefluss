import { sql } from "drizzle-orm";
import { XMLParser } from "fast-xml-parser";
import { db } from "../db/index.js";
import { catalogBooks, type NewCatalogBook } from "../db/schema.js";
import { env } from "../env.js";

const FEED_URL = "https://standardebooks.org/feeds/opds/all";

type OpdsLink = { "@_rel"?: string; "@_href"?: string; "@_type"?: string; "@_title"?: string };
type OpdsAuthor = { name?: string };
type OpdsCategory = { "@_term"?: string; "@_label"?: string };
type OpdsEntry = {
	id?: unknown;
	title?: unknown;
	summary?: unknown;
	content?: unknown;
	"dc:language"?: unknown;
	author?: OpdsAuthor | OpdsAuthor[];
	link?: OpdsLink | OpdsLink[];
	category?: OpdsCategory | OpdsCategory[];
};

function text(v: unknown): string | undefined {
	if (v === undefined || v === null) return undefined;
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	if (typeof v === "object" && "#text" in v) {
		const t = (v as { "#text": unknown })["#text"];
		return t === undefined || t === null ? undefined : String(t);
	}
	return undefined;
}

function asArray<T>(v: T | T[] | undefined): T[] {
	if (v === undefined) return [];
	return Array.isArray(v) ? v : [v];
}

/** Extract the SE slug from the entry id URL: https://standardebooks.org/ebooks/mary-shelley/frankenstein → mary-shelley/frankenstein */
function extractSlug(entryId: string | undefined): string | null {
	if (!entryId) return null;
	const m = entryId.match(/\/ebooks\/(.+?)(?:\/|$)/);
	if (!m?.[1]) {
		// Also allow a full two-segment slug path
		const m2 = entryId.match(/ebooks\/([^/]+\/[^/?#]+)/);
		return m2?.[1] ?? null;
	}
	// Capture potentially multi-segment slug: author/work
	const m3 = entryId.match(/ebooks\/([^/]+\/[^/?#]+)/);
	return m3?.[1] ?? m[1];
}

function mapEntry(entry: OpdsEntry): NewCatalogBook | null {
	const slug = extractSlug(text(entry.id));
	const title = text(entry.title)?.trim();
	if (!slug || !title) return null;

	const authors = asArray(entry.author)
		.map((a) => a.name?.trim())
		.filter((n): n is string => Boolean(n));

	const links = asArray(entry.link);
	const epub = links.find(
		(l) =>
			l["@_rel"] === "http://opds-spec.org/acquisition/open-access" &&
			l["@_title"] === "Recommended compatible epub",
	);
	const cover = links.find(
		(l) =>
			(l["@_rel"] === "http://opds-spec.org/image/thumbnail" ||
				l["@_rel"] === "http://opds-spec.org/image") &&
			l["@_type"]?.startsWith("image/"),
	);

	const subjects = asArray(entry.category)
		.map((c) => c["@_label"] ?? c["@_term"])
		.filter((s): s is string => Boolean(s));

	return {
		id: `se:${slug}`,
		source: "standard_ebooks",
		title,
		author: authors.join(", ") || null,
		language: text(entry["dc:language"]) ?? null,
		subjects: subjects.length > 0 ? subjects : null,
		summary: text(entry.summary) ?? null,
		description: text(entry.content) ?? null,
		epubUrl: epub?.["@_href"] ? new URL(epub["@_href"], FEED_URL).toString() : null,
		coverUrl: cover?.["@_href"] ? new URL(cover["@_href"], FEED_URL).toString() : null,
	};
}

export async function syncStandardEbooks(): Promise<{ upserted: number; skipped: boolean }> {
	if (!env.SE_EMAIL || !env.SE_PASSWORD) {
		console.warn("[se] SE_EMAIL/SE_PASSWORD not set, skipping sync");
		return { upserted: 0, skipped: true };
	}
	console.log("[se] fetching OPDS feed…");
	const t0 = Date.now();

	const auth = Buffer.from(`${env.SE_EMAIL}:${env.SE_PASSWORD}`).toString("base64");
	const res = await fetch(FEED_URL, { headers: { Authorization: `Basic ${auth}` } });

	if (res.status === 401 || res.status === 403) {
		console.warn(`[se] auth failed (${res.status}), SE patron subscription may have lapsed`);
		return { upserted: 0, skipped: true };
	}
	if (!res.ok) throw new Error(`[se] feed HTTP ${res.status}`);

	const xml = await res.text();
	console.log(`[se] fetched ${(xml.length / 1024).toFixed(0)}KB in ${Date.now() - t0}ms, parsing…`);

	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
		trimValues: true,
		parseTagValue: false,
		parseAttributeValue: false,
	});
	const parsed = parser.parse(xml) as { feed?: { entry?: OpdsEntry | OpdsEntry[] } };
	const entries = asArray(parsed.feed?.entry);
	console.log(`[se] parsed ${entries.length} entries, mapping…`);

	const rows = entries.map(mapEntry).filter((r): r is NewCatalogBook => r !== null);
	console.log(`[se] upserting ${rows.length} rows…`);

	if (rows.length > 0) {
		await db
			.insert(catalogBooks)
			.values(rows)
			.onConflictDoUpdate({
				target: catalogBooks.id,
				set: {
					title: sql`excluded.title`,
					author: sql`excluded.author`,
					language: sql`excluded.language`,
					subjects: sql`excluded.subjects`,
					summary: sql`excluded.summary`,
					description: sql`excluded.description`,
					epubUrl: sql`excluded.epub_url`,
					coverUrl: sql`excluded.cover_url`,
					syncedAt: sql`now()`,
				},
			});
	}

	console.log(`[se] done, upserted ${rows.length} in ${Date.now() - t0}ms`);
	return { upserted: rows.length, skipped: false };
}
