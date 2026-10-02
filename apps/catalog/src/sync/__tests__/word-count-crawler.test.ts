import { beforeAll, describe, expect, it, vi } from "vitest";

let mod: typeof import("../word-count-crawler.js");

beforeAll(async () => {
	vi.stubEnv("DATABASE_URL", process.env.DATABASE_URL ?? "postgres://unused@localhost/unused");
	mod = await import("../word-count-crawler.js");
});

describe("crawlConfig", () => {
	it("is off unless switched on", () => {
		expect(mod.crawlConfig({}).enabled).toBe(false);
		expect(mod.crawlConfig({ WORD_COUNT_CRAWL: "off" }).enabled).toBe(false);
		expect(mod.crawlConfig({ WORD_COUNT_CRAWL: "on" }).enabled).toBe(true);
	});

	it("can never run in tests or CI", () => {
		expect(mod.crawlConfig({ WORD_COUNT_CRAWL: "on", NODE_ENV: "test" }).enabled).toBe(false);
		expect(mod.crawlConfig({ WORD_COUNT_CRAWL: "on", VITEST: "true" }).enabled).toBe(false);
		expect(mod.crawlConfig({ WORD_COUNT_CRAWL: "on", CI: "1" }).enabled).toBe(false);
		// This process itself is a test run.
		expect(mod.crawlConfig({ ...process.env, WORD_COUNT_CRAWL: "on" }).enabled).toBe(false);
	});

	it("never goes faster than one request every 3 s", () => {
		expect(mod.crawlConfig({ WORD_COUNT_CRAWL_INTERVAL_MS: "100" }).intervalMs).toBe(3000);
		expect(mod.crawlConfig({ WORD_COUNT_CRAWL_INTERVAL_MS: "5000" }).intervalMs).toBe(5000);
		expect(mod.crawlConfig({ WORD_COUNT_CRAWL_INTERVAL_MS: "fast" }).intervalMs).toBe(3000);
	});
});

describe("crawlUrl", () => {
	const mirror = "https://gutenberg.pglaf.org";

	it("sends Gutenberg to the mirror, never www.gutenberg.org", () => {
		const url = mod.crawlUrl(
			{
				id: "gutenberg:84",
				source: "gutenberg",
				epub_url: "https://www.gutenberg.org/ebooks/84.epub3.images",
			},
			mirror,
		);
		// The no-images build: same words, a fraction of the download.
		expect(url).toBe("https://gutenberg.pglaf.org/cache/epub/84/pg84.epub");
	});

	it("skips Gutenberg ids it cannot map", () => {
		expect(
			mod.crawlUrl(
				{ id: "gutenberg:abc", source: "gutenberg", epub_url: "https://www.gutenberg.org/x" },
				mirror,
			),
		).toBeNull();
	});

	it("uses the feed URL for Standard Ebooks", () => {
		const epub = "https://standardebooks.org/ebooks/a/b/downloads/a_b.epub?source=feed";
		expect(mod.crawlUrl({ id: "se:a/b", source: "standard_ebooks", epub_url: epub }, mirror)).toBe(
			epub,
		);
	});
});

describe("nextBackoff", () => {
	it("starts well above the interval, doubles and caps at an hour", () => {
		const first = mod.nextBackoff(0, 3000);
		expect(first).toBe(60_000);
		expect(mod.nextBackoff(first, 3000)).toBe(120_000);
		expect(mod.nextBackoff(50 * 60_000, 3000)).toBe(60 * 60_000);
	});
});

describe("downloadEpub", () => {
	const fetchReturning = (res: Response) => (async () => res) as unknown as typeof fetch;
	const streamOf = (chunks: Uint8Array[], failAfter?: number) =>
		new ReadableStream<Uint8Array>({
			start(controller) {
				chunks.forEach((c, i) => {
					if (failAfter !== undefined && i === failAfter) controller.error(new Error("ECONNRESET"));
					else controller.enqueue(c);
				});
				if (failAfter === undefined) controller.close();
			},
		});

	it("returns the bytes", async () => {
		const out = await mod.downloadEpub(
			"https://x.test/a.epub",
			{},
			fetchReturning(new Response(streamOf([new Uint8Array([1, 2, 3])]))),
		);
		expect(out.kind).toBe("ok");
		expect(out.kind === "ok" && [...out.bytes]).toEqual([1, 2, 3]);
	});

	it("treats a connection dropped mid-body as a retry, not a crash", async () => {
		const out = await mod.downloadEpub(
			"https://x.test/a.epub",
			{},
			fetchReturning(new Response(streamOf([new Uint8Array(10), new Uint8Array(10)], 1))),
		);
		expect(out).toEqual({ kind: "retry" });
	});

	it("stops reading past the cap even without a content-length", async () => {
		const mb = new Uint8Array(1024 * 1024);
		const out = await mod.downloadEpub(
			"https://x.test/a.epub",
			{},
			fetchReturning(new Response(streamOf(Array.from({ length: 51 }, () => mb)))),
		);
		expect(out).toEqual({ kind: "failed" });
	});

	it("retries throttling and server errors and fails other statuses", async () => {
		const status = (code: number) => fetchReturning(new Response("x", { status: code }));
		expect(await mod.downloadEpub("u", {}, status(429))).toEqual({ kind: "retry" });
		expect(await mod.downloadEpub("u", {}, status(503))).toEqual({ kind: "retry" });
		expect(await mod.downloadEpub("u", {}, status(404))).toEqual({ kind: "failed" });
	});
});

describe("afterRetry", () => {
	it("backs off on the first retries of a row, then gives it up and resets", () => {
		const first = mod.afterRetry(mod.NO_RETRIES, "gutenberg:37106", 3000);
		expect(first).toEqual({
			state: { rowId: "gutenberg:37106", attempts: 1, backoff: 60_000 },
			giveUp: false,
		});
		const second = mod.afterRetry(first.state, "gutenberg:37106", 3000);
		expect(second).toEqual({
			state: { rowId: "gutenberg:37106", attempts: 2, backoff: 120_000 },
			giveUp: false,
		});
		expect(mod.afterRetry(second.state, "gutenberg:37106", 3000)).toEqual({
			state: mod.NO_RETRIES,
			giveUp: true,
		});
	});

	it("counts attempts per row but keeps the global backoff across rows", () => {
		const busy = mod.afterRetry(mod.NO_RETRIES, "a", 3000);
		const other = mod.afterRetry(busy.state, "b", 3000);
		expect(other.state.attempts).toBe(1);
		expect(other.state.backoff).toBe(120_000);
	});
});
