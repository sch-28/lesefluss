import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { catalogTags, type NewCatalogBook } from "../db/schema.js";
import type { Tag } from "../lib/tags.js";

/** A row ready to upsert plus the tag labels it needs in `catalog_tags`. */
export type MappedBook = { row: NewCatalogBook; tags: Tag[] };

/**
 * Upsert labels so the canonical spelling wins over whatever an older run
 * wrote. Called per batch, so the id set per call is small.
 */
export async function upsertTagLabels(tags: Iterable<Tag>): Promise<void> {
	const unique = new Map<string, Tag>();
	for (const t of tags) unique.set(t.id, t);
	if (unique.size === 0) return;
	await db
		.insert(catalogTags)
		.values([...unique.values()])
		.onConflictDoUpdate({ target: catalogTags.id, set: { label: sql`excluded.label` } });
}
