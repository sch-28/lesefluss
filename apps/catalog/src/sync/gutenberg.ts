import { createReadStream } from "node:fs";
import { inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { catalogBooks } from "../db/schema.js";
import { captureException } from "../lib/error-tracking.js";
import { settledEstimate } from "../lib/length-estimate.js";
import { type MappedBook, upsertTagLabels } from "./enrich.js";
import { downloadArchive, readRdfEntries } from "./gutenberg-archive.js";
import { mapBook, SYNCED_COLUMNS, syncedFields } from "./gutenberg-map.js";
import { parseGutenbergRdf } from "./gutenberg-rdf.js";
import { addBooksUpserted, setSyncPhase } from "./orchestrator.js";

const BATCH_SIZE = 500;
/** The real archive holds ~78k ebooks; far fewer means a truncated or wrong file. */
const MIN_ENTRIES = 50_000;
/** A few broken RDFs are expected; more than this suggests the archive itself is bad. */
const MAX_FAILURE_RATE = 0.01;

type BatchCounts = { added: number; changed: number; unchanged: number };
export type SyncCounts = BatchCounts & { entries: number; skipped: number; failed: number };

const updateSet = Object.fromEntries(
	SYNCED_COLUMNS.map((column) => {
		const name = catalogBooks[column].name;
		return [
			column,
			column === "summary"
				? sql`COALESCE(excluded.summary, catalog_books.summary)`
				: sql.raw(`excluded.${name}`),
		];
	}),
);

/**
 * Upsert only the rows that differ from what is stored. A record without a
 * summary keeps the stored one rather than clearing it. `suppressed` is set
 * only on insert: a book without an EPUB can't be opened in the app, so it
 * arrives hidden. It is never updated, since SE dedup and manual takedowns own
 * it from then on.
 */
async function upsertChanged(mapped: MappedBook[]): Promise<BatchCounts> {
	if (mapped.length === 0) return { added: 0, changed: 0, unchanged: 0 };
	const existing = await db
		.select()
		.from(catalogBooks)
		.where(
			inArray(
				catalogBooks.id,
				mapped.map((m) => m.row.id),
			),
		);
	const stored = new Map(existing.map((r) => [r.id, r]));

	const toWrite: MappedBook[] = [];
	let added = 0;
	let changed = 0;
	for (const m of mapped) {
		const current = stored.get(m.row.id);
		if (!current) {
			added++;
			toWrite.push({ ...m, row: { ...m.row, suppressed: m.row.epubUrl === null } });
			continue;
		}
		const next = {
			...m.row,
			summary: m.row.summary ?? current.summary,
			wordCountEstimate: settledEstimate(
				current.wordCountEstimate,
				m.row.wordCountEstimate ?? null,
			),
		};
		if (syncedFields(next) === syncedFields(current)) continue;
		changed++;
		toWrite.push({ ...m, row: next });
	}

	if (toWrite.length > 0) {
		await upsertTagLabels(toWrite.flatMap((m) => m.tags));
		await db
			.insert(catalogBooks)
			.values(toWrite.map((m) => m.row))
			.onConflictDoUpdate({
				target: catalogBooks.id,
				set: { ...updateSet, syncedAt: sql`now()` },
			});
	}
	return { added, changed, unchanged: mapped.length - toWrite.length };
}

/**
 * Sync from a stream of `pg<id>.rdf` documents. Only text ebooks are kept:
 * audio books have no EPUB to read. An unreadable entry is counted and
 * skipped so one bad file can't cost the week's sync; the run fails only
 * when too many are bad or too few arrived to be the whole catalog.
 */
export async function syncGutenbergFromRdf(
	rdfs: AsyncIterable<string>,
	limits: { minEntries?: number; maxFailureRate?: number } = {},
): Promise<SyncCounts> {
	const { minEntries = 0, maxFailureRate = MAX_FAILURE_RATE } = limits;
	const totals: SyncCounts = {
		added: 0,
		changed: 0,
		unchanged: 0,
		entries: 0,
		skipped: 0,
		failed: 0,
	};
	const failures: string[] = [];
	let batch: MappedBook[] = [];

	const flush = async () => {
		const counts = await upsertChanged(batch);
		totals.added += counts.added;
		totals.changed += counts.changed;
		totals.unchanged += counts.unchanged;
		addBooksUpserted(counts.added + counts.changed);
		batch = [];
		setSyncPhase("gutenberg", `parsed_${totals.entries}`);
	};

	for await (const xml of rdfs) {
		totals.entries++;
		let mapped: MappedBook | null;
		try {
			const record = parseGutenbergRdf(xml);
			mapped = record && (!record.type || record.type === "Text") ? mapBook(record) : null;
		} catch (err) {
			totals.failed++;
			if (failures.length < 5) failures.push(String(err));
			continue;
		}
		if (!mapped) {
			totals.skipped++;
			continue;
		}
		batch.push(mapped);
		if (batch.length >= BATCH_SIZE) await flush();
	}
	await flush();

	if (totals.failed > 0) {
		console.warn(`[gutenberg] ${totals.failed} unreadable entries, e.g. ${failures.join(" | ")}`);
	}
	if (totals.failed > totals.entries * maxFailureRate) {
		throw new Error(
			`${totals.failed} of ${totals.entries} Gutenberg catalog entries were unreadable`,
		);
	}
	if (totals.entries < minEntries) {
		throw new Error(
			`Gutenberg catalog had only ${totals.entries} entries, expected ${minEntries}+`,
		);
	}
	if (totals.failed > 0) {
		captureException(new Error("Gutenberg catalog entries unreadable"), {
			tags: { kind: "sync", source: "gutenberg" },
			extra: { failed: totals.failed, entries: totals.entries, examples: failures },
		});
	}
	return totals;
}

export async function syncGutenberg(): Promise<SyncCounts> {
	console.log("[gutenberg] downloading offline catalog");
	setSyncPhase("gutenberg", "downloading");
	const { file, cleanup } = await downloadArchive();
	try {
		const counts = await syncGutenbergFromRdf(readRdfEntries(createReadStream(file)), {
			minEntries: MIN_ENTRIES,
		});
		console.log(
			`[gutenberg] done: ${counts.added} new, ${counts.changed} changed, ${counts.unchanged} unchanged, ${counts.skipped} skipped, ${counts.failed} unreadable`,
		);
		return counts;
	} finally {
		await cleanup();
	}
}
