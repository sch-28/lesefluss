import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

/**
 * `(a, b) IN ((x1, y1), (x2, y2), …)` for a non-empty list of pairs. Drizzle's
 * `inArray` takes a column, not a row constructor, so this is spelled out.
 */
export function pairIn(
	columns: [SQLWrapper, SQLWrapper],
	pairs: readonly [unknown, unknown][],
): SQL {
	if (pairs.length === 0) return sql`false`;
	return sql`(${columns[0]}, ${columns[1]}) IN (${sql.join(
		pairs.map(([a, b]) => sql`(${a}, ${b})`),
		sql`, `,
	)})`;
}
