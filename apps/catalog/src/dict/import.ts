import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { setImmediate as yieldToLoop } from "node:timers/promises";
import { createGunzip } from "node:zlib";
import { sql } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import type { NewDictEntry } from "../db/schema.js";
import { invalidateDictCounts } from "../lib/dict-counts.js";
import { captureException } from "../lib/error-tracking.js";
import { DICT_LANGUAGES, findLanguage } from "./languages.js";
import { emptyParseStats, type ParseStats, parseLine } from "./parse.js";

/**
 * Postgres caps a statement at 65535 bind parameters. Ten columns per row leaves
 * headroom at 5000; computed rather than hardcoded so adding a column can't
 * silently break the import.
 */
const COLUMNS_PER_ROW = 10;
const BATCH_ROWS = Math.min(5000, Math.floor(60000 / COLUMNS_PER_ROW));

/** The parse loop is synchronous; without a yield it starves the HTTP server. */
const YIELD_EVERY_LINES = 20_000;

const LOG_EVERY_ROWS = 100_000;

/**
 * Arbitrary constant identifying the dictionary-import advisory lock.
 *
 * The in-process `running` flag only guards one process. Two replicas would
 * otherwise import at once and collide on the same staging table, so the real
 * mutual exclusion lives in Postgres. Session-scoped, so it needs a dedicated
 * client held for the whole run and released in `finally`.
 */
const IMPORT_LOCK_KEY = 8_141_990_231_555_001n;

type State = {
	running: boolean;
	currentLang: string | null;
	phase: string | null;
	linesRead: number;
	rowsWritten: number;
	rowsReplaced: number;
	stats: ParseStats;
	lastStartedAt: Date | null;
	lastFinishedAt: Date | null;
	lastError: string | null;
};

const state: State = {
	running: false,
	currentLang: null,
	phase: null,
	linesRead: 0,
	rowsWritten: 0,
	rowsReplaced: 0,
	stats: emptyParseStats(),
	lastStartedAt: null,
	lastFinishedAt: null,
	lastError: null,
};

export function getDictImportState(): Readonly<State> {
	return state;
}

export type DictImportTarget = string;

export function isDictImportTarget(value: unknown): value is DictImportTarget {
	return (
		typeof value === "string" && (value === "all" || DICT_LANGUAGES.some((l) => l.code === value))
	);
}

/**
 * Import one language, or every configured language in chain order.
 *
 * Never throws: the caller fires it without awaiting, so a failure has to be
 * recorded in state and reported rather than surfacing as an unhandled rejection.
 */
export async function runDictImport(target: DictImportTarget = "all"): Promise<void> {
	if (state.running) {
		console.log("[dict] import already running, ignoring trigger");
		return;
	}

	// Cross-process guard. Taken before any state is reset so a losing replica
	// leaves the winner's reported progress untouched.
	const lockClient = await pool.connect();
	let locked = false;
	try {
		const got = await lockClient.query<{ locked: boolean }>(
			"SELECT pg_try_advisory_lock($1) AS locked",
			[IMPORT_LOCK_KEY.toString()],
		);
		locked = got.rows[0]?.locked === true;
	} catch (err) {
		lockClient.release();
		throw err;
	}
	if (!locked) {
		lockClient.release();
		console.log("[dict] another instance holds the import lock, ignoring trigger");
		return;
	}

	state.running = true;
	state.lastStartedAt = new Date();
	state.lastError = null;
	state.linesRead = 0;
	state.rowsWritten = 0;
	state.rowsReplaced = 0;
	state.stats = emptyParseStats();

	const languages = target === "all" ? DICT_LANGUAGES : [findLanguage(target)].filter((l) => !!l);

	try {
		for (const language of languages) {
			await importLanguage(language.code, language.url);
		}
	} catch (err) {
		state.lastError = err instanceof Error ? err.message : String(err);
		console.error("[dict] import failed:", state.lastError);
		captureException(err, {
			tags: { kind: "dict-import" },
			extra: { lang: state.currentLang, phase: state.phase, rowsWritten: state.rowsWritten },
		});
	} finally {
		try {
			await lockClient.query("SELECT pg_advisory_unlock($1)", [IMPORT_LOCK_KEY.toString()]);
		} catch (err) {
			// The lock dies with the session anyway; losing it here must not mask
			// the import's own outcome.
			console.error("[dict] failed to release import lock:", err);
		}
		lockClient.release();
		state.running = false;
		state.currentLang = null;
		state.phase = null;
		state.lastFinishedAt = new Date();
	}
}

async function importLanguage(lang: string, url: string): Promise<void> {
	state.currentLang = lang;
	state.phase = "streaming";

	// Load into a scratch table, then swap in one transaction. Readers keep
	// seeing the previous import until that commit, so an interrupted run leaves
	// the live dictionary untouched rather than half-replaced.
	//
	// UNLOGGED halves WAL for the load and lets Postgres truncate the table on
	// crash recovery, which is exactly the right outcome for an abandoned import.
	const staging = stagingTableFor(lang);
	await db.execute(sql.raw(`DROP TABLE IF EXISTS ${staging}`));
	await db.execute(
		sql.raw(`CREATE UNLOGGED TABLE ${staging} (LIKE catalog_dict_entry INCLUDING DEFAULTS)`),
	);

	const res = await fetch(url);
	if (!res.ok || !res.body) throw new Error(`kaikki ${lang}: HTTP ${res.status}`);

	const lines = createInterface({
		input: Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]).pipe(
			createGunzip(),
		),
		crlfDelay: Number.POSITIVE_INFINITY,
	});

	// entry_index groups the senses of one dump entry so homographs stay visually
	// separate in the drawer. It orders rows, it does not identify them, so only
	// the current word needs tracking — a per-word map would grow to ~1.5M keys
	// and cost hundreds of MB.
	let currentKey = "";
	let currentIndex = 0;
	let batch: NewDictEntry[] = [];
	let sinceYield = 0;
	let sinceLog = 0;

	for await (const line of lines) {
		state.linesRead++;
		if (!line) continue;

		const rows = parseLine(line, lang, 0, state.stats);
		if (rows.length) {
			const key = rows[0]?.wordKey ?? "";
			if (key === currentKey) {
				currentIndex++;
			} else {
				currentKey = key;
				currentIndex = 0;
			}
			for (const row of rows) row.entryIndex = currentIndex;
			batch.push(...rows);
		}

		if (batch.length >= BATCH_ROWS) {
			await writeBatch(staging, batch);
			state.rowsWritten += batch.length;
			sinceLog += batch.length;
			batch = [];
			if (sinceLog >= LOG_EVERY_ROWS) {
				console.log(`[dict] ${lang}: ${state.rowsWritten.toLocaleString()} rows staged`);
				sinceLog = 0;
			}
		}

		if (++sinceYield >= YIELD_EVERY_LINES) {
			sinceYield = 0;
			await yieldToLoop();
		}
	}

	if (batch.length) {
		await writeBatch(staging, batch);
		state.rowsWritten += batch.length;
	}

	state.phase = "swapping";
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const deleted = await client.query("DELETE FROM catalog_dict_entry WHERE lang = $1", [lang]);
		await client.query(
			`INSERT INTO catalog_dict_entry
				(lang, word_key, word, entry_index, pos, pos_rank, sense_index, gloss, example, form_of)
			 SELECT lang, word_key, word, entry_index, pos, pos_rank, sense_index, gloss, example, form_of
			 FROM ${staging}`,
		);
		await client.query("COMMIT");
		state.rowsReplaced += deleted.rowCount ?? 0;
	} catch (err) {
		await client.query("ROLLBACK");
		throw err;
	} finally {
		client.release();
	}

	await db.execute(sql.raw(`DROP TABLE IF EXISTS ${staging}`));

	// ANALYZE because the planner has no statistics for a table that just went
	// from empty to millions of rows and would sequential-scan every lookup.
	// VACUUM because the swap deletes and reinserts the whole language, and the
	// dead tuples would otherwise accumulate across imports. Neither blocks
	// readers, and the swap itself only takes a RowExclusiveLock.
	state.phase = "vacuuming";
	await db.execute(sql`VACUUM (ANALYZE) catalog_dict_entry`);
	invalidateDictCounts();

	console.log(
		`[dict] ${lang}: done — ${state.rowsWritten.toLocaleString()} rows, ` +
			`${state.rowsReplaced.toLocaleString()} replaced, ${JSON.stringify(state.stats)}`,
	);
}

/** `lang` is validated against the edition config before reaching here. */
function stagingTableFor(lang: string): string {
	return `catalog_dict_staging_${lang.replace(/[^a-z0-9]/g, "")}`;
}

async function writeBatch(staging: string, rows: NewDictEntry[]): Promise<void> {
	const params: unknown[] = [];
	const tuples = rows.map((r) => {
		const base = params.length;
		params.push(
			r.lang,
			r.wordKey,
			r.word,
			r.entryIndex,
			r.pos,
			r.posRank,
			r.senseIndex,
			r.gloss,
			r.example ?? null,
			r.formOf ?? null,
		);
		return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`;
	});

	await pool.query(
		`INSERT INTO ${staging}
			(lang, word_key, word, entry_index, pos, pos_rank, sense_index, gloss, example, form_of)
		 VALUES ${tuples.join(",")}`,
		params,
	);
}
