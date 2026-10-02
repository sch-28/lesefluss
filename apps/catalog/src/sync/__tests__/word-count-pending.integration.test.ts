// @vitest-environment node
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
const PREFIX = `test-pending-${Date.now()}`;
const EPUB = "https://example.test/new.epub";

let db: typeof import("../../db/index.js").db;
let PENDING_WHERE: typeof import("../word-count-crawler.js").PENDING_WHERE;

type Row = { id: string; source: string; wordCount: number | null; countedFrom: string | null };
const ROWS: Row[] = [
	{ id: `se:${PREFIX}/uncounted`, source: "standard_ebooks", wordCount: null, countedFrom: null },
	{ id: `gutenberg:${PREFIX}-uncounted`, source: "gutenberg", wordCount: null, countedFrom: null },
	{
		id: `gutenberg:${PREFIX}-stale`,
		source: "gutenberg",
		wordCount: 900,
		countedFrom: "https://example.test/old.epub",
	},
	{ id: `gutenberg:${PREFIX}-current`, source: "gutenberg", wordCount: 900, countedFrom: EPUB },
];

describe.skipIf(!hasDb)("crawler pending set (integration)", () => {
	beforeAll(async () => {
		const [dbMod, { migrate }, crawler] = await Promise.all([
			import("../../db/index.js"),
			import("../../db/migrate.js"),
			import("../word-count-crawler.js"),
		]);
		db = dbMod.db;
		PENDING_WHERE = crawler.PENDING_WHERE;
		await migrate();
		for (const r of ROWS) {
			await db.execute(sql`
				INSERT INTO catalog_books (id, source, title, epub_url, word_count, word_count_epub_url)
				VALUES (${r.id}, ${r.source}, ${r.id}, ${EPUB}, ${r.wordCount}, ${r.countedFrom})
			`);
		}
	});

	afterAll(async () => {
		if (!db) return;
		for (const r of ROWS) await db.execute(sql`DELETE FROM catalog_books WHERE id = ${r.id}`);
	});

	it("counts Standard Ebooks in full but redoes Gutenberg only when its EPUB changed", async () => {
		const { rows } = await db.execute<{ id: string }>(sql`
			SELECT id FROM catalog_books WHERE id LIKE ${`%${PREFIX}%`} AND ${PENDING_WHERE} ORDER BY id
		`);
		expect(rows.map((r) => r.id)).toEqual([`gutenberg:${PREFIX}-stale`, `se:${PREFIX}/uncounted`]);
	});
});
