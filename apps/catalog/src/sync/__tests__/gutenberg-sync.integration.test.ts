// @vitest-environment node
import { createReadStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);
// Ids far above the real catalog so fixtures never collide with synced books.
const FRANKENSTEIN = 9_000_084;
const MUSKETEERS = 9_001_257;
const AUDIO = 9_019_159;
const INGERSOLL = 9_099_002;
const NO_EPUB = 9_099_001;
const ALL_IDS = [FRANKENSTEIN, MUSKETEERS, AUDIO, INGERSOLL, NO_EPUB];

let db: typeof import("../../db/index.js").db;
let syncGutenbergFromRdf: typeof import("../gutenberg.js").syncGutenbergFromRdf;
let readRdfEntries: typeof import("../gutenberg-archive.js").readRdfEntries;

/** A fixture RDF re-keyed to a test id, with optional text edits. */
function fixture(name: string, id: number, edit: (xml: string) => string = (x) => x): string {
	const xml = readFileSync(new URL(`./fixtures/rdf/${name}`, import.meta.url), "utf8");
	return edit(xml.replace(/ebooks\/\d+"/, `ebooks/${id}"`));
}

async function* stream(xmls: string[]) {
	yield* xmls;
}

async function row(id: number) {
	const { rows } = await db.execute<{
		title: string;
		summary: string | null;
		download_count: number | null;
		suppressed: boolean;
	}>(
		sql`SELECT title, summary, download_count, suppressed FROM catalog_books WHERE id = ${`gutenberg:${id}`}`,
	);
	return rows[0];
}

describe.skipIf(!hasDb)("Gutenberg RDF sync (integration)", () => {
	beforeAll(async () => {
		const [dbMod, { migrate }, gutenberg, archive] = await Promise.all([
			import("../../db/index.js"),
			import("../../db/migrate.js"),
			import("../gutenberg.js"),
			import("../gutenberg-archive.js"),
		]);
		db = dbMod.db;
		syncGutenbergFromRdf = gutenberg.syncGutenbergFromRdf;
		readRdfEntries = archive.readRdfEntries;
		await migrate();
	});

	afterAll(async () => {
		if (!db) return;
		for (const id of ALL_IDS) {
			await db.execute(sql`DELETE FROM catalog_books WHERE id = ${`gutenberg:${id}`}`);
		}
	});

	it("adds new books, skips audio, then writes only what changed", async () => {
		const first = await syncGutenbergFromRdf(
			stream([
				fixture("pg84.rdf", FRANKENSTEIN),
				fixture("pg1257.rdf", MUSKETEERS),
				fixture("pg19159.rdf", AUDIO),
			]),
		);
		expect(first).toMatchObject({ added: 2, changed: 0, unchanged: 0, skipped: 1, failed: 0 });
		expect(await row(AUDIO)).toBeUndefined();

		const again = await syncGutenbergFromRdf(
			stream([
				fixture("pg84.rdf", FRANKENSTEIN, (x) => x.replace(">144008<", ">144100<")),
				fixture("pg1257.rdf", MUSKETEERS),
			]),
		);
		expect(again).toMatchObject({ added: 0, changed: 1, unchanged: 1 });
		expect((await row(FRANKENSTEIN))?.download_count).toBe(144100);
	});

	it("ignores a text-size change that moves the estimate by 1% or less", async () => {
		const resized = (bytes: string) =>
			fixture("pg84.rdf", FRANKENSTEIN, (x) =>
				x.replace(">144008<", ">144100<").replace(">448885<", `>${bytes}<`),
			);
		expect(await syncGutenbergFromRdf(stream([resized("450000")]))).toMatchObject({ unchanged: 1 });
		expect(await syncGutenbergFromRdf(stream([resized("470000")]))).toMatchObject({ changed: 1 });
	});

	it("keeps the stored summary when the catalog entry has none", async () => {
		const withoutSummary = fixture("pg84.rdf", FRANKENSTEIN, (x) =>
			x.replace(/<pgterms:marc520>[\s\S]*?<\/pgterms:marc520>/, ""),
		);
		await syncGutenbergFromRdf(stream([withoutSummary]));
		expect((await row(FRANKENSTEIN))?.summary).toMatch(/Gothic novel/);
	});

	it("counts an unreadable entry and still syncs the rest of the archive", async () => {
		const archive = fileURLToPath(new URL("./fixtures/rdf-files.tar.bz2", import.meta.url));
		const rekeyed = async function* () {
			for await (const xml of readRdfEntries(createReadStream(archive))) {
				yield xml.replace(/ebooks\/99002"/, `ebooks/${INGERSOLL}"`);
			}
		};
		const counts = await syncGutenbergFromRdf(rekeyed(), { maxFailureRate: 0.5 });
		expect(counts).toMatchObject({ entries: 5, failed: 1 });
		expect((await row(INGERSOLL))?.title).toBe(
			"The Works of Robert G. Ingersoll, Vol. 05 (of 12): Dresden Edition—Discussions",
		);
	});

	it("fails the run when too many entries are unreadable or too few arrived", async () => {
		const broken = fixture("broken.rdf", 0);
		await expect(
			syncGutenbergFromRdf(stream([fixture("pg1257.rdf", MUSKETEERS), broken])),
		).rejects.toThrow(/1 of 2 .* unreadable/);
		await expect(
			syncGutenbergFromRdf(stream([fixture("pg1257.rdf", MUSKETEERS)]), { minEntries: 2 }),
		).rejects.toThrow(/only 1 entries/);
	});

	it("inserts a book without an EPUB hidden and a readable one visible", async () => {
		await syncGutenbergFromRdf(stream([fixture("pg99001.rdf", NO_EPUB)]));
		expect((await row(NO_EPUB))?.suppressed).toBe(true);
		expect((await row(MUSKETEERS))?.suppressed).toBe(false);
	});

	it("never unhides an existing row, even when its data changes", async () => {
		await db.execute(
			sql`UPDATE catalog_books SET suppressed = true WHERE id = ${`gutenberg:${MUSKETEERS}`}`,
		);
		const counts = await syncGutenbergFromRdf(
			stream([fixture("pg1257.rdf", MUSKETEERS, (x) => x.replace(">5120<", ">5200<"))]),
		);
		expect(counts).toMatchObject({ changed: 1 });
		expect(await row(MUSKETEERS)).toMatchObject({ download_count: 5200, suppressed: true });
	});
});
