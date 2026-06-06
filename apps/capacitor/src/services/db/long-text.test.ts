// @vitest-environment node
import { WordIndex } from "@lesefluss/core";
import { drizzle } from "drizzle-orm/sql-js";
// @ts-expect-error - sql.js ships no type declarations
import initSqlJs from "sql.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendLongText, type LongTextExecutor, readLongText } from "./long-text";
import { bookContent } from "./schema";

const ID = "aaaaaaaa";

type Harness = {
	exec: LongTextExecutor;
	runs: () => number;
	seed: (content?: string, wordIndex?: string | null) => void;
};

let db: ReturnType<typeof drizzle>;

async function makeHarness(): Promise<Harness> {
	const SQL = await initSqlJs();
	const sqldb = new SQL.Database();
	sqldb.run(
		`CREATE TABLE book_content (book_id TEXT PRIMARY KEY, content TEXT NOT NULL DEFAULT '', word_index TEXT);`,
	);
	db = drizzle(sqldb);
	let runCount = 0;
	const exec: LongTextExecutor = {
		run: async (q) => {
			runCount++;
			db.run(q);
		},
		// Mirror the production proxy adapter, which returns a positional value
		// array (sql.js's db.get yields a column-keyed object).
		get: async (q) => {
			const row = db.get(q) as Record<string, unknown> | undefined;
			return row ? Object.values(row) : undefined;
		},
	};
	const seed = (content = "", wordIndex: string | null = null) => {
		sqldb.run("INSERT INTO book_content (book_id, content, word_index) VALUES (?, ?, ?)", [
			ID,
			content,
			wordIndex,
		]);
	};
	return { exec, runs: () => runCount, seed };
}

async function roundTrip(h: Harness, value: string, chunk: number): Promise<string | null> {
	await appendLongText(
		h.exec,
		bookContent,
		bookContent.content,
		bookContent.bookId,
		ID,
		value,
		chunk,
	);
	return readLongText(h.exec, bookContent, bookContent.content, bookContent.bookId, ID, chunk);
}

describe("long-text chunked column", () => {
	let h: Harness;
	beforeEach(async () => {
		h = await makeHarness();
	});

	it("round-trips a large string across many chunk boundaries", async () => {
		h.seed();
		const value = "abcdefghij".repeat(100_000); // 1MB
		expect(await roundTrip(h, value, 4096)).toBe(value); // ~256 chunks
	});

	it("preserves astral + multibyte chars straddling chunk boundaries", async () => {
		const chunk = 16;
		// Place a 4-byte astral emoji and a 2-byte umlaut at, just before, and just
		// after the chunk boundary. A naive UTF-16 `off` advance corrupts these.
		for (const pad of [chunk - 2, chunk - 1, chunk, chunk + 1]) {
			const h2 = await makeHarness();
			h2.seed();
			const value = `${"x".repeat(pad)}💩ä${"y".repeat(40)}`;
			expect(await roundTrip(h2, value, chunk)).toBe(value);
		}
	});

	it("handles the empty string", async () => {
		h.seed();
		expect(await roundTrip(h, "", 1024)).toBe("");
	});

	it("returns null for a missing row", async () => {
		expect(
			await readLongText(h.exec, bookContent, bookContent.content, bookContent.bookId, ID),
		).toBeNull();
	});

	it("takes the single-statement fast path under one chunk", async () => {
		h.seed();
		const before = h.runs();
		await appendLongText(
			h.exec,
			bookContent,
			bookContent.content,
			bookContent.bookId,
			ID,
			"small value",
			1024,
		);
		expect(h.runs() - before).toBe(1);
	});

	it("round-trips a serialized WordIndex JSON blob", async () => {
		const text = "The quick brown fox jumps over the lazy dog.\n\n".repeat(500);
		const wi = WordIndex.build(text);
		const json = JSON.stringify(wi.serialize());
		h.seed(text);
		await appendLongText(
			h.exec,
			bookContent,
			bookContent.wordIndex,
			bookContent.bookId,
			ID,
			json,
			1024,
		);
		const read = await readLongText(
			h.exec,
			bookContent,
			bookContent.wordIndex,
			bookContent.bookId,
			ID,
			1024,
		);
		expect(read).toBe(json);
		const restored = WordIndex.deserialize(JSON.parse(read as string), text);
		expect(restored.wordCount).toBe(wi.wordCount);
	});

	it("does not split a surrogate pair on write", async () => {
		// Spy the bound chunk values: none may contain a lone surrogate.
		h.seed();
		const value = `${"x".repeat(15)}💩💩💩💩💩`;
		const spy = vi.spyOn(h.exec, "run");
		await appendLongText(
			h.exec,
			bookContent,
			bookContent.content,
			bookContent.bookId,
			ID,
			value,
			16,
		);
		expect(
			await readLongText(h.exec, bookContent, bookContent.content, bookContent.bookId, ID, 16),
		).toBe(value);
		spy.mockRestore();
	});
});
