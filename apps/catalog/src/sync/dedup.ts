import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

const THRESHOLD = 0.8;

/**
 * For each SE row, find the best Gutenberg match by pg_trgm similarity on title + author
 * (author hint derived from the SE slug's first segment, e.g. "mary-shelley" → "mary shelley").
 * When combined similarity ≥ THRESHOLD, store gutenberg_id on the SE row and mark the
 * matched Gutenberg row as suppressed.
 *
 * Runs as a single SQL pass using a LATERAL join + CTE so we don't round-trip per SE row.
 */
export async function dedupSE(): Promise<{ matched: number }> {
	console.log("[dedup] starting");

	const result = await db.execute<{ se_id: string; pg_id: string }>(sql`
		WITH scored AS (
			SELECT se.id AS se_id, best.pg_id, best.score
			FROM catalog_books se
			CROSS JOIN LATERAL (
				SELECT pg.id AS pg_id,
					similarity(pg.title, se.title)
						+ similarity(
							coalesce(pg.author, ''),
							coalesce(
								se.author,
								replace(split_part(replace(se.id, 'se:', ''), '/', 1), '-', ' ')
							)
						) AS score
				FROM catalog_books pg
				WHERE pg.source = 'gutenberg'
					AND (
						pg.title % se.title
						OR pg.author % coalesce(
							se.author,
							replace(split_part(replace(se.id, 'se:', ''), '/', 1), '-', ' ')
						)
					)
				ORDER BY score DESC
				LIMIT 1
			) AS best
			WHERE se.source = 'standard_ebooks'
		),
		matches AS (
			SELECT se_id, pg_id FROM scored WHERE score >= ${THRESHOLD}
		),
		link_se AS (
			UPDATE catalog_books AS b
			SET gutenberg_id = m.pg_id
			FROM matches m
			WHERE b.id = m.se_id
			RETURNING m.se_id, m.pg_id
		),
		suppress_pg AS (
			UPDATE catalog_books AS b
			SET suppressed = true
			FROM matches m
			WHERE b.id = m.pg_id
			RETURNING 1
		)
		SELECT se_id, pg_id FROM link_se
	`);

	const matched = result.rows.length;
	console.log(`[dedup] done, ${matched} SE rows matched to Gutenberg`);
	return { matched };
}
