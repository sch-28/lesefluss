import { type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

/**
 * Moving a multi-megabyte TEXT value across the Capacitor SQLite bridge in one
 * statement OOMs the native side: `Bridge.callPluginMethod` does
 * `JSONObject.toString` on the whole param/result string (a 50MB book needs a
 * ~75MB allocation against a 256MB ART heap → crash). These helpers chunk the
 * value so every bridge round-trip carries at most `LONG_TEXT_CHUNK` characters.
 *
 * The executor is injected so the helpers can be unit-tested against a real
 * SQLite (sql.js) without Capacitor. Both the production drizzle proxy and a
 * sql.js drizzle instance satisfy `LongTextExecutor` directly.
 */
export interface LongTextExecutor {
	run(query: SQL): Promise<unknown>;
	/** Returns the selected row as a positional value array (raw `sql` has no field mapping). */
	get(query: SQL): Promise<unknown[] | undefined>;
}

export const LONG_TEXT_CHUNK = 512 * 1024;

/** Code-point count. SQLite `length`/`substr` count code points, JS `.length` counts UTF-16 units. */
function codePointCount(s: string): number {
	let n = 0;
	for (const _ of s) n++;
	return n;
}

/**
 * End index for a chunk starting at `start`, never splitting a surrogate pair.
 * A lone surrogate would not survive the UTF-8 round-trip through SQLite.
 */
function chunkEnd(value: string, start: number, size: number): number {
	let end = Math.min(value.length, start + size);
	if (end < value.length) {
		const code = value.charCodeAt(end - 1);
		if (code >= 0xd800 && code <= 0xdbff) end--; // trailing high surrogate → defer to next chunk
	}
	return end;
}

/**
 * Append `value` into `column` for the row keyed by `bookId`, in chunks. The row
 * must already exist (callers seed it). Small values take a single statement.
 */
export async function appendLongText(
	exec: LongTextExecutor,
	table: SQLiteTable,
	column: SQLiteColumn,
	idColumn: SQLiteColumn,
	bookId: string,
	value: string,
	chunkSize = LONG_TEXT_CHUNK,
): Promise<void> {
	// SQLite rejects a table-qualified column in a SET target ("book_content"."content"),
	// so reference the bare column name.
	const col = sql.identifier(column.name);
	const id = sql.identifier(idColumn.name);
	if (value.length <= chunkSize) {
		await exec.run(sql`UPDATE ${table} SET ${col} = ${value} WHERE ${id} = ${bookId}`);
		return;
	}
	let start = 0;
	let first = true;
	while (start < value.length) {
		const end = chunkEnd(value, start, chunkSize);
		const chunk = value.slice(start, end);
		if (first) {
			await exec.run(sql`UPDATE ${table} SET ${col} = ${chunk} WHERE ${id} = ${bookId}`);
			first = false;
		} else {
			await exec.run(sql`UPDATE ${table} SET ${col} = ${col} || ${chunk} WHERE ${id} = ${bookId}`);
		}
		start = end;
	}
}

/**
 * Read `column` for the row keyed by `bookId` in chunks, reassembling in JS.
 * Returns null when the row is missing or the column is NULL, "" when empty.
 * The reassembled string lives in the JS heap (large but fine: the OOM was the
 * native bridge, not V8).
 */
export async function readLongText(
	exec: LongTextExecutor,
	table: SQLiteTable,
	column: SQLiteColumn,
	idColumn: SQLiteColumn,
	bookId: string,
	chunkSize = LONG_TEXT_CHUNK,
): Promise<string | null> {
	const col = sql.identifier(column.name);
	const id = sql.identifier(idColumn.name);
	const lenRow = await exec.get(sql`SELECT length(${col}) FROM ${table} WHERE ${id} = ${bookId}`);
	const rawLen = lenRow?.[0];
	if (rawLen === undefined || rawLen === null) return null;
	const total = Number(rawLen);
	if (!Number.isFinite(total) || total <= 0) return "";

	const parts: string[] = [];
	let off = 1; // SQLite substr is 1-indexed
	while (off <= total) {
		const row = await exec.get(
			sql`SELECT substr(${col}, ${off}, ${chunkSize}) FROM ${table} WHERE ${id} = ${bookId}`,
		);
		const chunk = row?.[0];
		if (typeof chunk !== "string" || chunk.length === 0) break;
		parts.push(chunk);
		off += codePointCount(chunk);
	}
	return parts.join("");
}
