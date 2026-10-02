import { type SQL, sql } from "drizzle-orm";

/**
 * `ARRAY[$1, $2, ...]::text[]` with one bind parameter per element. Passing a
 * JS array as a single parameter trips node-pg's text→text[] coercion
 * (`malformed array literal`).
 */
export function textArray(values: readonly string[]): SQL {
	if (values.length === 0) return sql`ARRAY[]::text[]`;
	return sql`ARRAY[${sql.join(
		values.map((v) => sql`${v}`),
		sql`, `,
	)}]::text[]`;
}
