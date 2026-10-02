import { setTimeout as sleepFor } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { env } from "../env.js";
import { MAX_EPUB_BYTES } from "../lib/epub-limits.js";
import { captureException } from "../lib/error-tracking.js";
import { userAgent } from "../lib/user-agent.js";
import { countEpubWords } from "../lib/word-count.js";
import { markWordCountFailed, storeWordCount } from "./word-count-store.js";

const MIN_INTERVAL_MS = 3000;
const DEFAULT_MIRROR = "https://gutenberg.pglaf.org";
const USER_AGENT = userAgent("word-count crawler");
const FETCH_TIMEOUT_MS = 60_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;
const RETRY_FAILED_AFTER = "7 days";
/** Arbitrary, fixed key for pg_try_advisory_lock; one crawler per database. */
const CRAWLER_LOCK_KEY = 7_160_003;

export type CrawlConfig = {
	enabled: boolean;
	intervalMs: number;
	mirror: string;
};

/** Resolved crawler settings. Tests and CI can never switch it on. */
export function crawlConfig(source: {
	WORD_COUNT_CRAWL?: string;
	WORD_COUNT_CRAWL_INTERVAL_MS?: string;
	GUTENBERG_MIRROR?: string;
	NODE_ENV?: string;
	VITEST?: string;
	CI?: string;
}): CrawlConfig {
	const isTestOrCi = source.NODE_ENV === "test" || Boolean(source.VITEST) || Boolean(source.CI);
	const interval = Number(source.WORD_COUNT_CRAWL_INTERVAL_MS);
	return {
		enabled: source.WORD_COUNT_CRAWL === "on" && !isTestOrCi,
		intervalMs: Number.isFinite(interval) ? Math.max(MIN_INTERVAL_MS, interval) : MIN_INTERVAL_MS,
		mirror: (source.GUTENBERG_MIRROR || DEFAULT_MIRROR).replace(/\/+$/, ""),
	};
}

type PendingRow = { id: string; source: string; epub_url: string };

/**
 * Where to download a row's EPUB. Gutenberg goes to the mirror's generated
 * EPUB path, never to www.gutenberg.org, whose robot policy asks bulk access
 * to use mirrors. Null when no permitted URL exists.
 */
export function crawlUrl(row: PendingRow, mirror: string): string | null {
	if (row.source === "gutenberg") {
		const id = /^gutenberg:(\d+)$/.exec(row.id)?.[1];
		return id ? `${mirror}/cache/epub/${id}/pg${id}-images.epub` : null;
	}
	if (row.source === "standard_ebooks") return row.epub_url;
	return null;
}

/** Backoff after a throttling or server error: doubles from the base interval, capped. */
export function nextBackoff(current: number, intervalMs: number): number {
	return Math.min(MAX_BACKOFF_MS, current === 0 ? intervalMs * 20 : current * 2);
}

async function nextPending(): Promise<PendingRow | null> {
	// SE first (small, patron-authorized), then the most-read Gutenberg books.
	const { rows } = await db.execute<PendingRow>(sql`
		SELECT id, source, epub_url FROM catalog_books
		WHERE epub_url IS NOT NULL AND suppressed = false
			AND (word_count IS NULL OR word_count_epub_url IS DISTINCT FROM epub_url)
			AND (word_count_failed_at IS NULL
				OR word_count_failed_at < now() - ${RETRY_FAILED_AFTER}::interval)
		ORDER BY (source = 'standard_ebooks') DESC, download_count DESC NULLS LAST, id
		LIMIT 1
	`);
	return rows[0] ?? null;
}

export type FetchOutcome = { kind: "ok"; bytes: Buffer } | { kind: "retry" } | { kind: "failed" };

/**
 * Download one EPUB, streamed with a running byte cap so a missing or lying
 * content-length can't pull more than the cap into memory. Network trouble at
 * any point, including mid-body, is a retry, never a throw.
 */
export async function downloadEpub(
	url: string,
	headers: Record<string, string>,
	fetchImpl: typeof fetch = fetch,
): Promise<FetchOutcome> {
	try {
		const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (res.status === 429 || res.status >= 500) return { kind: "retry" };
		if (!res.ok || !res.body) return { kind: "failed" };
		if (Number(res.headers.get("content-length") ?? 0) > MAX_EPUB_BYTES) return { kind: "failed" };

		const chunks: Uint8Array[] = [];
		let size = 0;
		const reader = res.body.getReader();
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_EPUB_BYTES) {
				await reader.cancel();
				return { kind: "failed" };
			}
			chunks.push(value);
		}
		return { kind: "ok", bytes: Buffer.concat(chunks) };
	} catch {
		return { kind: "retry" };
	}
}

function requestHeaders(source: string): Record<string, string> {
	const headers: Record<string, string> = { "User-Agent": USER_AGENT };
	if (source === "standard_ebooks" && env.SE_EMAIL && env.SE_PASSWORD) {
		headers.Authorization = `Basic ${Buffer.from(`${env.SE_EMAIL}:${env.SE_PASSWORD}`).toString("base64")}`;
	}
	return headers;
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
	await sleepFor(ms, undefined, { signal }).catch(() => undefined);
}

/**
 * Count words for every EPUB-bearing row that lacks a count for its current
 * EPUB, one download per interval, in sequence. All progress lives in the
 * table, so a restart resumes where it stopped.
 */
export async function runWordCountCrawler(config: CrawlConfig, signal: AbortSignal): Promise<void> {
	// Held on its own connection for the process lifetime: a second pod, or the
	// old one during a rolling deploy, finds the lock taken and stays idle.
	const lockClient = await pool.connect();
	const { rows } = await lockClient.query<{ locked: boolean }>(
		"SELECT pg_try_advisory_lock($1) AS locked",
		[CRAWLER_LOCK_KEY],
	);
	if (!rows[0]?.locked) {
		lockClient.release();
		console.log("[word-count] another instance holds the crawler lock; not crawling here");
		return;
	}
	signal.addEventListener("abort", () => lockClient.release(), { once: true });

	console.log(`[word-count] crawler on, every ${config.intervalMs} ms via ${config.mirror}`);
	let backoff = 0;
	while (!signal.aborted) {
		const row = await nextPending().catch((err: unknown) => {
			captureException(err, { tags: { kind: "word-count" } });
			return null;
		});
		if (!row) {
			// Nothing pending; new rows arrive with the weekly sync.
			await sleep(MAX_BACKOFF_MS, signal);
			continue;
		}

		const url = crawlUrl(row, config.mirror);
		const outcome: FetchOutcome = url
			? await downloadEpub(url, requestHeaders(row.source))
			: { kind: "failed" };
		if (outcome.kind === "retry") {
			backoff = nextBackoff(backoff, config.intervalMs);
			console.warn(`[word-count] ${row.id}: upstream busy, backing off ${backoff} ms`);
			await sleep(backoff, signal);
			continue;
		}
		backoff = 0;

		try {
			const count = outcome.kind === "ok" ? await countEpubWords(outcome.bytes) : null;
			if (count === null) await markWordCountFailed(row.id);
			else await storeWordCount(row.id, row.epub_url, count);
		} catch (err) {
			captureException(err, { tags: { kind: "word-count" }, extra: { id: row.id } });
			// Without this the same row comes back next pass and blocks every other book.
			await markWordCountFailed(row.id).catch(() => undefined);
		}

		await sleep(config.intervalMs, signal);
	}
}
