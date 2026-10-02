import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { authorKeys, splitAuthors } from "../lib/authors.js";
import { MARC_SUBFIELD_SQL_PATTERN } from "../lib/display.js";
import { textArray } from "../lib/sql-array.js";
import type { Tag } from "../lib/tags.js";
import { tagsFor } from "../lib/tags.js";
import { upsertTagLabels } from "./enrich.js";

const BATCH_SIZE = 500;

type Row = { id: string; subjects: string[] | null; author: string | null };

/** Titles synced before `cleanTitle` existed. Idempotent; a no-op once clean. */
export async function cleanStoredTitles(): Promise<number> {
	const { rowCount } = await db.execute(sql`
		UPDATE catalog_books
		SET title = btrim(regexp_replace(title, ${MARC_SUBFIELD_SQL_PATTERN}, ': ', 'g'))
		WHERE source = 'gutenberg' AND title ~ ${MARC_SUBFIELD_SQL_PATTERN}
	`);
	return rowCount ?? 0;
}

/**
 * Re-derive every row's tags, e.g. after `lib/tags.ts` changed. Clears them so
 * the normal backfill picks every row up again.
 */
export async function retagAll(): Promise<{ updated: number }> {
	await db.execute(sql`UPDATE catalog_books SET tags = NULL`);
	return backfillDerivedColumns();
}

/**
 * Derive tags and author keys for rows written before those columns existed.
 * Works from stored data only, so it needs no upstream fetch. Author keys come
 * from the joined display string here; the next full sync replaces them with
 * keys from the structured author list.
 */
export async function backfillDerivedColumns(): Promise<{ updated: number }> {
	let updated = 0;
	let cursor = "";
	for (;;) {
		const { rows } = await db.execute<Row>(sql`
			SELECT id, subjects, author FROM catalog_books
			WHERE tags IS NULL AND id > ${cursor}
			ORDER BY id
			LIMIT ${BATCH_SIZE}
		`);
		const last = rows[rows.length - 1];
		if (!last) break;

		const labels: Tag[] = [];
		const values = rows.map((r) => {
			const { ids, tags } = tagsFor(r.subjects);
			labels.push(...tags);
			const keys = r.author ? authorKeys(splitAuthors(r.author)) : [];
			return sql`(${r.id}, ${textArray(ids)}, ${keys.length > 0 ? textArray(keys) : sql`NULL::text[]`})`;
		});
		await upsertTagLabels(labels);
		await db.execute(sql`
			UPDATE catalog_books b
			SET tags = v.tags, author_keys = COALESCE(b.author_keys, v.author_keys)
			FROM (VALUES ${sql.join(values, sql`, `)}) AS v(id, tags, author_keys)
			WHERE b.id = v.id
		`);
		updated += rows.length;
		cursor = last.id;
	}
	return { updated };
}
