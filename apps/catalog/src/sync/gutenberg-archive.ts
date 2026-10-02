import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { buffer } from "node:stream/consumers";
import { pipeline } from "node:stream/promises";
import { setTimeout as sleep } from "node:timers/promises";
import tar from "tar-stream";
import bz2 from "unbzip2-stream";
import { userAgent } from "../lib/user-agent.js";

/** Project Gutenberg's offline catalog, one RDF per ebook, regenerated daily for bulk use. */
const RDF_ARCHIVE_URL = "https://www.gutenberg.org/cache/epub/feeds/rdf-files.tar.bz2";
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
/** The real archive is ~130 MB; anything near this is not the catalog. */
const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
/** Real entries are tens of KB. A huge one is skipped rather than buffered. */
const MAX_ENTRY_BYTES = 5 * 1024 * 1024;
/**
 * Fixed rather than mkdtemp: a run killed by SIGKILL or OOM never reaches its
 * cleanup, and the next run's `rm` then reclaims the space instead of leaking it.
 */
const DOWNLOAD_DIR = join(tmpdir(), "lesefluss-gutenberg-rdf");

function byteLimit(max: number): Transform & { bytes: number } {
	const counter = new Transform({
		transform(chunk: Buffer, _enc, done) {
			counter.bytes += chunk.length;
			done(counter.bytes > max ? new Error(`archive larger than ${max} bytes`) : null, chunk);
		},
	}) as Transform & { bytes: number };
	counter.bytes = 0;
	return counter;
}

/**
 * Download the archive to disk, retrying with exponential backoff. Nothing
 * touches the database until a complete file is there, so a failed download
 * leaves every row as it was. The caller runs `cleanup` when done.
 */
export async function downloadArchive(
	url = RDF_ARCHIVE_URL,
	deps: { fetchImpl?: typeof fetch; backoffMs?: number } = {},
): Promise<{ file: string; cleanup: () => Promise<void> }> {
	const fetchImpl = deps.fetchImpl ?? fetch;
	const backoff = deps.backoffMs ?? BASE_BACKOFF_MS;
	const cleanup = () => rm(DOWNLOAD_DIR, { recursive: true, force: true });
	await cleanup();
	await mkdir(DOWNLOAD_DIR, { recursive: true });
	const file = join(DOWNLOAD_DIR, "rdf-files.tar.bz2");

	let lastError: unknown;
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		try {
			const res = await fetchImpl(url, {
				headers: { "User-Agent": userAgent("weekly catalog sync") },
				signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
			});
			if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
			const counter = byteLimit(MAX_ARCHIVE_BYTES);
			await pipeline(
				Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
				counter,
				createWriteStream(file),
			);
			// A connection closed cleanly mid-body looks like success to the stream.
			const expected = Number(res.headers.get("content-length"));
			if (expected > 0 && counter.bytes !== expected) {
				throw new Error(`truncated download: ${counter.bytes} of ${expected} bytes`);
			}
			return { file, cleanup };
		} catch (err) {
			lastError = err;
			if (attempt < MAX_ATTEMPTS - 1) await sleep(backoff * 2 ** attempt);
		}
	}
	await cleanup();
	throw new Error(`Gutenberg catalog download failed after ${MAX_ATTEMPTS} attempts: ${lastError}`);
}

/**
 * Yield each `.rdf` entry of a tar.bz2 as text, one at a time. Decompression
 * and tar parsing are streamed and backpressured, so only the current entry
 * is held in memory, never the ~1 GB uncompressed set.
 */
export async function* readRdfEntries(source: Readable): AsyncGenerator<string> {
	const extract = tar.extract();
	const unpacking = pipeline(source, bz2(), extract);
	// Surface a decompression or read failure even while the loop waits on an entry.
	unpacking.catch((err) => extract.destroy(err));
	for await (const entry of extract) {
		const { name, size = 0, type } = entry.header;
		if (type !== "file" || !name.endsWith(".rdf")) {
			entry.resume();
			continue;
		}
		if (size > MAX_ENTRY_BYTES) {
			console.warn(`[gutenberg] skipping ${name}: ${size} bytes`);
			entry.resume();
			continue;
		}
		yield (await buffer(entry)).toString("utf8");
	}
	await unpacking;
}
