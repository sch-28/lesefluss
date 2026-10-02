import { createReadStream, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { downloadArchive, readRdfEntries } from "../gutenberg-archive.js";

const archivePath = fileURLToPath(new URL("./fixtures/rdf-files.tar.bz2", import.meta.url));
const archiveBytes = readFileSync(archivePath);
const ARCHIVE_URL = "https://example.test/rdf.tar.bz2";

async function collect(it: AsyncIterable<string>): Promise<string[]> {
	const out: string[] = [];
	for await (const x of it) out.push(x);
	return out;
}

describe("readRdfEntries", () => {
	it("yields every .rdf entry and skips directories and other files", async () => {
		const entries = await collect(readRdfEntries(createReadStream(archivePath)));
		expect(entries).toHaveLength(5);
		expect(entries.find((x) => x.includes('ebooks/84"'))).toBe(
			readFileSync(new URL("./fixtures/rdf/pg84.rdf", import.meta.url), "utf8"),
		);
	});

	it("fails on a corrupt archive instead of ending quietly", async () => {
		const truncated = Readable.from([archiveBytes.subarray(0, archiveBytes.length / 2)]);
		await expect(collect(readRdfEntries(truncated))).rejects.toThrow();
	});
});

describe("downloadArchive", () => {
	const archive = (headers: Record<string, string> = {}) => new Response(archiveBytes, { headers });

	it("sends a descriptive User-Agent and saves the archive to disk", async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => archive());
		const { file, cleanup } = await downloadArchive(ARCHIVE_URL, { fetchImpl });
		try {
			const init = fetchImpl.mock.calls[0]?.[1];
			expect(new Headers(init?.headers).get("User-Agent")).toMatch(
				/lesefluss-catalog.*\+https:\/\//,
			);
			expect(await readFile(file)).toEqual(archiveBytes);
		} finally {
			await cleanup();
		}
	});

	it("retries after a 403 and a network error, then succeeds", async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response("blocked", { status: 403 }))
			.mockRejectedValueOnce(new Error("socket hang up"))
			.mockResolvedValueOnce(archive());
		const { cleanup } = await downloadArchive(ARCHIVE_URL, { fetchImpl, backoffMs: 1 });
		await cleanup();
		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});

	it("treats a body shorter than Content-Length as a failed attempt", async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () =>
			archive({ "content-length": String(archiveBytes.length + 100) }),
		);
		await expect(downloadArchive(ARCHIVE_URL, { fetchImpl, backoffMs: 1 })).rejects.toThrow(
			/truncated download/,
		);
		expect(fetchImpl).toHaveBeenCalledTimes(4);
	});

	it("gives up after its attempts and reports the last error", async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => new Response("blocked", { status: 403 }));
		await expect(downloadArchive(ARCHIVE_URL, { fetchImpl, backoffMs: 1 })).rejects.toThrow(
			/failed after 4 attempts: Error: HTTP 403/,
		);
		expect(fetchImpl).toHaveBeenCalledTimes(4);
	});
});
