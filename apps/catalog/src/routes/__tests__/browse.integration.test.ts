// @vitest-environment node
//
// Exercises /search, /tags, /genres and /languages against Postgres.
// Run locally with:
//   DATABASE_URL=postgres://... pnpm --filter @lesefluss/catalog test

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tagsFor } from "../../lib/tags.js";

const hasDb = Boolean(process.env.DATABASE_URL);

// Letters only: author keys and tag slugs drop digits, so a hex nonce would not
// survive normalization.
const NONCE = randomUUID()
	.replace(/[^0-9a-f]/g, "")
	.slice(0, 10)
	.replace(/[0-9]/g, (d) => "ghijklmnop"[Number(d)] as string);
// ISO 639 reserves qaa-qtz for local use, so no real book carries these and
// every lang-scoped count is fixtures only.
const LANG = "qaa";
const EMPTY_LANG = "qab";
const SURNAME = `Zqx${NONCE}`;
const UNIQUE_SUBJECT = `Lighthouses ${NONCE}`;
const UNIQUE_TAG = `lighthouses-${NONCE}`;

type Fixture = {
	id: string;
	source: "gutenberg" | "standard_ebooks";
	title: string;
	author: string;
	subjects: string[];
	downloadCount: number;
	addedDaysAgo: number;
	wordCount?: number;
	wordCountEstimate?: number;
	suppressed?: boolean;
};

const FIXTURES: Fixture[] = [
	{
		id: `se:test/${NONCE}/alpha`,
		source: "standard_ebooks",
		title: `Alpha ${NONCE}`,
		author: `Mary ${SURNAME}`,
		subjects: ["Short Fiction", "Ghost stories", UNIQUE_SUBJECT],
		downloadCount: 10,
		addedDaysAgo: 3,
		wordCount: 1_000,
	},
	{
		id: `gutenberg:test-${NONCE}-beta`,
		source: "gutenberg",
		title: `Beta ${NONCE}`,
		author: `${SURNAME}, Mary Wollstonecraft`,
		subjects: ["Short stories, English", "Horror tales"],
		downloadCount: 50,
		addedDaysAgo: 1,
		wordCount: 50_000,
		// The exact count must win over this.
		wordCountEstimate: 99_999,
	},
	{
		id: `gutenberg:test-${NONCE}-gamma`,
		source: "gutenberg",
		title: `Gamma ${NONCE}`,
		author: `Other${NONCE}, John`,
		subjects: ["Love stories", "Ghost stories"],
		downloadCount: 30,
		addedDaysAgo: 2,
		wordCountEstimate: 20_000,
	},
	{
		id: `gutenberg:test-${NONCE}-suppressed`,
		source: "gutenberg",
		title: `Delta ${NONCE}`,
		author: `${SURNAME}, Mary`,
		subjects: ["Short stories"],
		downloadCount: 999,
		addedDaysAgo: 0,
		wordCount: 10,
		suppressed: true,
	},
];

const titleOf = (letter: string) => `${letter} ${NONCE}`;

type SearchBody = {
	total: number;
	sort: string;
	order: string;
	source: string;
	tags: string[];
	results: {
		id: string;
		title: string;
		hasEpub: boolean;
		wordCount: number | null;
		wordCountEstimated: boolean;
	}[];
	facets?: { tags: { id: string; label: string; count: number }[] };
	suggestion?: string | null;
	error?: string;
};

let app: Hono;
let db: typeof import("../../db/index.js").db;

async function get<T>(path: string): Promise<{ status: number; body: T }> {
	const res = await app.request(path);
	return { status: res.status, body: (await res.json()) as T };
}

const search = (qs: string) => get<SearchBody>(`/search?lang=${LANG}&${qs}`);
const titles = (body: SearchBody) => body.results.map((r) => r.title);

describe.skipIf(!hasDb)("catalog browse routes (integration)", () => {
	beforeAll(async () => {
		// Imported lazily: src/env.ts throws at module load when DATABASE_URL is unset.
		const [{ Hono }, dbMod, { migrate }, schema, enrich, authors, routes] = await Promise.all([
			import("hono"),
			import("../../db/index.js"),
			import("../../db/migrate.js"),
			import("../../db/schema.js"),
			import("../../sync/enrich.js"),
			import("../../lib/authors.js"),
			Promise.all([
				import("../search.js"),
				import("../tags.js"),
				import("../genres.js"),
				import("../languages.js"),
				import("../books.js"),
				import("../landing.js"),
			]),
		]);
		db = dbMod.db;
		await migrate();

		const [
			{ searchRoute },
			{ tagsRoute },
			{ genresRoute },
			{ languagesRoute },
			{ booksRoute },
			{ landingRoute },
		] = routes;
		app = new Hono()
			.route("/search", searchRoute)
			.route("/tags", tagsRoute)
			.route("/genres", genresRoute)
			.route("/languages", languagesRoute)
			.route("/books", booksRoute)
			.route("/landing", landingRoute);

		const rows = FIXTURES.map((f) => {
			const { ids, tags } = tagsFor(f.subjects);
			return {
				tags,
				row: {
					id: f.id,
					source: f.source,
					title: f.title,
					author: f.author,
					language: LANG,
					subjects: f.subjects,
					suppressed: f.suppressed ?? false,
					downloadCount: f.downloadCount,
					tags: ids,
					authorKeys: authors.authorKeys([f.author]),
					addedAt: new Date(Date.now() - f.addedDaysAgo * 86_400_000),
					wordCount: f.wordCount ?? null,
					wordCountEstimate: f.wordCountEstimate ?? null,
				},
			};
		});
		await enrich.upsertTagLabels(rows.flatMap((r) => r.tags));
		await db.insert(schema.catalogBooks).values(rows.map((r) => r.row));
	});

	afterAll(async () => {
		if (!db) return;
		await db.execute(sql`DELETE FROM catalog_books WHERE language = ${LANG}`);
		await db.execute(sql`DELETE FROM catalog_tags WHERE id = ${UNIQUE_TAG}`);
	});

	describe("/search validation", () => {
		it("browses the whole language when no filter is given", async () => {
			const { status, body } = await search("sort=title");
			expect(status).toBe(200);
			expect(titles(body)).toEqual([titleOf("Alpha"), titleOf("Beta"), titleOf("Gamma")]);
		});

		it("rejects an unknown sort", async () => {
			const { status, body } = await search(`q=${NONCE}&sort=shuffle`);
			expect(status).toBe(400);
			expect(body.error).toContain("sort");
		});

		it("rejects an unknown source", async () => {
			const { status } = await search(`q=${NONCE}&source=librivox`);
			expect(status).toBe(400);
		});

		it("drops unknown tags and genres and echoes what it applied", async () => {
			const { status, body } = await search(`tag=nope-${NONCE},short-stories&genre=nope`);
			expect(status).toBe(200);
			expect(body.tags).toEqual(["short-stories"]);
			expect((body as SearchBody & { genre: string | null }).genre).toBeNull();
			expect(titles(body).sort()).toEqual([titleOf("Alpha"), titleOf("Beta")]);
		});

		it("answers a link whose only filters went stale with an empty result, not an error", async () => {
			const { status, body } = await search(`tag=nope-${NONCE}`);
			expect(status).toBe(200);
			expect(body.tags).toEqual([]);
			expect(body.total).toBe(0);
		});

		it("rejects an overlong query", async () => {
			const { status } = await search(`q=${"a".repeat(201)}`);
			expect(status).toBe(400);
		});

		it("rejects a malformed tag id", async () => {
			const { status } = await search("tag=Not%20A%20Slug");
			expect(status).toBe(400);
		});

		it("rejects a malformed lang without caching it", async () => {
			const res = await get<SearchBody>(`/search?lang=${"x".repeat(40)}&q=a`);
			expect(res.status).toBe(400);
			expect((await get(`/tags?lang=en-${NONCE}`)).status).toBe(400);
			expect((await get(`/genres?lang=${NONCE}`)).status).toBe(400);
		});

		it("rejects a page past the offset cap", async () => {
			const { status } = await search(`q=${NONCE}&page=100000&limit=50`);
			expect(status).toBe(400);
		});

		it("rejects an overlong author", async () => {
			const { status } = await search(`author=${"a".repeat(201)}`);
			expect(status).toBe(400);
		});

		it("rejects an author that normalizes to nothing", async () => {
			const { status } = await search("author=%2C%2C");
			expect(status).toBe(400);
		});
	});

	describe("/search tag filter", () => {
		it("filters by one tag and hides suppressed rows", async () => {
			const { status, body } = await search("tag=short-stories");
			expect(status).toBe(200);
			expect(titles(body).sort()).toEqual([titleOf("Alpha"), titleOf("Beta")]);
		});

		it("tells the client whether each result has an EPUB", async () => {
			const { body } = await search("tag=short-stories");
			expect(body.results.every((r) => r.hasEpub === false)).toBe(true);
		});

		it("ANDs repeated and comma-separated tags", async () => {
			const repeated = await search("tag=short-stories&tag=ghost-stories");
			const comma = await search("tag=short-stories,ghost-stories");
			expect(titles(repeated.body)).toEqual([titleOf("Alpha")]);
			expect(titles(comma.body)).toEqual([titleOf("Alpha")]);
			expect(comma.body.tags).toEqual(["short-stories", "ghost-stories"]);
		});

		it("combines with q and genre", async () => {
			const withQ = await search("tag=ghost-stories&q=Gamma");
			expect(titles(withQ.body)).toEqual([titleOf("Gamma")]);
			const withGenre = await search("tag=ghost-stories&genre=romance");
			expect(titles(withGenre.body)).toEqual([titleOf("Gamma")]);
		});

		it("returns co-occurring tag facets with counts, excluding selected tags", async () => {
			const { body } = await search("tag=ghost-stories&facets=tags");
			const facets = body.facets?.tags ?? [];
			expect(facets.find((f) => f.id === "ghost-stories")).toBeUndefined();
			expect(facets).toContainEqual({ id: "short-stories", label: "Short stories", count: 1 });
			expect(facets).toContainEqual({ id: "romance", label: "Romance", count: 1 });
		});

		it("skips facets when only language or source narrows the set", async () => {
			const { status, body } = await search("source=se&facets=tags");
			expect(status).toBe(200);
			expect(body.facets).toBeUndefined();
		});

		it("omits facets unless asked", async () => {
			const { body } = await search("tag=ghost-stories");
			expect(body.facets).toBeUndefined();
		});
	});

	describe("/search sort", () => {
		const base = `q=${NONCE}`;

		it("sorts by popularity", async () => {
			const { body } = await search(`${base}&sort=popular`);
			expect(titles(body)).toEqual([titleOf("Beta"), titleOf("Gamma"), titleOf("Alpha")]);
		});

		it("sorts by title", async () => {
			const { body } = await search(`${base}&sort=title`);
			expect(titles(body)).toEqual([titleOf("Alpha"), titleOf("Beta"), titleOf("Gamma")]);
		});

		it("sorts by author", async () => {
			const { body } = await search(`${base}&sort=author`);
			expect(titles(body)).toEqual([titleOf("Alpha"), titleOf("Gamma"), titleOf("Beta")]);
		});

		it("sorts by recently added", async () => {
			const { body } = await search(`${base}&sort=recent`);
			expect(titles(body)).toEqual([titleOf("Beta"), titleOf("Gamma"), titleOf("Alpha")]);
		});

		it("still accepts the legacy order param", async () => {
			const { status, body } = await search(`${base}&order=popular`);
			expect(status).toBe(200);
			expect(body.sort).toBe("popular");
			expect(body.order).toBe("popular");
		});

		it("defaults to popular when browsing without a query", async () => {
			const { body } = await search("tag=ghost-stories");
			expect(body.sort).toBe("popular");
		});
	});

	describe("/search source filter", () => {
		it("restricts to Standard Ebooks", async () => {
			const { body } = await search(`q=${NONCE}&source=standard_ebooks`);
			expect(titles(body)).toEqual([titleOf("Alpha")]);
		});

		it("restricts to Gutenberg", async () => {
			const { body } = await search(`q=${NONCE}&source=gutenberg&sort=title`);
			expect(titles(body)).toEqual([titleOf("Beta"), titleOf("Gamma")]);
		});

		it("treats any as no filter and allows browsing by source alone", async () => {
			const any = await search(`q=${NONCE}&source=any`);
			expect(any.body.total).toBe(3);
			const seOnly = await search("source=se");
			expect(seOnly.status).toBe(200);
			expect(seOnly.body.source).toBe("standard_ebooks");
		});
	});

	describe("/search author filter", () => {
		it("matches both name styles of the same author", async () => {
			const se = await search(`author=${encodeURIComponent(`Mary ${SURNAME}`)}&sort=title`);
			expect(titles(se.body)).toEqual([titleOf("Alpha"), titleOf("Beta")]);
			const gut = await search(
				`author=${encodeURIComponent(`${SURNAME}, Mary Wollstonecraft`)}&sort=title`,
			);
			expect(titles(gut.body)).toEqual([titleOf("Alpha"), titleOf("Beta")]);
		});

		it("does not match a different author", async () => {
			const { body } = await search(`author=${encodeURIComponent(`John ${SURNAME}`)}`);
			expect(body.total).toBe(0);
		});
	});

	describe("/search word count", () => {
		it("returns the exact count, else the estimate, and flags the estimate", async () => {
			const { body } = await search(`q=${NONCE}&sort=title`);
			expect(body.results.map((r) => [r.wordCount, r.wordCountEstimated])).toEqual([
				[1_000, false],
				[50_000, false],
				[20_000, true],
			]);
		});

		it("filters on the exact count, else the estimate", async () => {
			const short = await search(`q=${NONCE}&max_words=5000`);
			expect(titles(short.body)).toEqual([titleOf("Alpha")]);
			const long = await search(`q=${NONCE}&min_words=5000&sort=title`);
			expect(titles(long.body)).toEqual([titleOf("Beta"), titleOf("Gamma")]);
			const both = await search(`q=${NONCE}&min_words=500&max_words=60000&sort=title`);
			expect(titles(both.body)).toEqual([titleOf("Alpha"), titleOf("Beta"), titleOf("Gamma")]);
			// Beta's estimate is 99,999 but its exact 50,000 is what counts.
			expect((await search(`q=${NONCE}&min_words=60000`)).body.total).toBe(0);
		});

		it("sorts by the effective length", async () => {
			const { body } = await search(`q=${NONCE}&sort=length`);
			expect(titles(body)).toEqual([titleOf("Alpha"), titleOf("Gamma"), titleOf("Beta")]);
		});

		it("rejects malformed or inverted bounds", async () => {
			expect((await search(`q=${NONCE}&min_words=abc`)).status).toBe(400);
			expect((await search(`q=${NONCE}&min_words=-5`)).status).toBe(400);
			expect((await search(`q=${NONCE}&min_words=10&max_words=5`)).status).toBe(400);
		});
	});

	describe("/search spelling suggestion", () => {
		it("suggests the closest title when nothing matched", async () => {
			const { body } = await search("q=Alphaa");
			expect(body.total).toBe(0);
			expect(body.suggestion).toBe(titleOf("Alpha"));
		});

		it("does not suggest when only the filters hide the query's matches", async () => {
			const { body } = await search(`q=${encodeURIComponent(titleOf("Alpha"))}&genre=poetry`);
			expect(body.total).toBe(0);
			expect(body.suggestion).toBeNull();
		});

		it("still suggests when the query matches nothing even unfiltered", async () => {
			const { body } = await search("q=Alphaa&source=gutenberg");
			expect(body.suggestion).toBe(titleOf("Alpha"));
		});

		it("does not suggest for a one-letter query", async () => {
			const { body } = await search("q=Q&tag=romance");
			expect(body.suggestion).toBeNull();
		});

		it("does not suggest when there are results", async () => {
			const { body } = await search(`q=${NONCE}`);
			expect(body.total).toBe(3);
			expect(body.suggestion).toBeNull();
		});
	});

	describe("/books/:id", () => {
		it("returns tags with labels in the book's order", async () => {
			const alpha = FIXTURES[0] as Fixture;
			const { status, body } = await get<{ tags: { id: string; label: string }[] }>(
				`/books/${encodeURIComponent(alpha.id)}`,
			);
			expect(status).toBe(200);
			expect(body.tags).toEqual([
				{ id: "short-stories", label: "Short stories" },
				{ id: "ghost-stories", label: "Ghost stories" },
				{ id: UNIQUE_TAG, label: UNIQUE_SUBJECT },
			]);
		});

		it("returns the effective length and whether it is estimated", async () => {
			const length = async (letter: string) => {
				const fixture = FIXTURES.find((f) => f.title === titleOf(letter)) as Fixture;
				const { body } = await get<{ wordCount: number | null; wordCountEstimated: boolean }>(
					`/books/${encodeURIComponent(fixture.id)}`,
				);
				return [body.wordCount, body.wordCountEstimated];
			};
			expect(await length("Beta")).toEqual([50_000, false]);
			expect(await length("Gamma")).toEqual([20_000, true]);
		});
	});

	describe("/books/similar/:id", () => {
		it("returns books sharing tags in the same language, leaving out the book and its author", async () => {
			const alpha = FIXTURES[0] as Fixture;
			const { status, body } = await get<{ results: { title: string }[] }>(
				`/books/similar/${encodeURIComponent(alpha.id)}`,
			);
			expect(status).toBe(200);
			// Beta shares a tag but has the same author (by key); Gamma shares ghost-stories.
			expect(body.results.map((r) => r.title)).toEqual([titleOf("Gamma")]);
		});

		it("returns an empty list for an unknown book", async () => {
			const { body } = await get<{ results: unknown[] }>(
				`/books/similar/gutenberg%3Anope-${NONCE}`,
			);
			expect(body.results).toEqual([]);
		});
	});

	describe("/landing", () => {
		it("returns a recently added shelf, newest first, and a few rotating genre shelves", async () => {
			const { status, body } = await get<{
				recently_added: { title: string }[];
				genres: { id: string }[];
				failed: string[];
			}>(`/landing?lang=${LANG}`);
			expect(status).toBe(200);
			expect(body.recently_added.map((b) => b.title)).toEqual([
				titleOf("Beta"),
				titleOf("Gamma"),
				titleOf("Alpha"),
			]);
			expect(body.genres).toHaveLength(3);
			expect(body.failed).toEqual([]);
		});

		it("rejects a malformed lang", async () => {
			expect((await get(`/landing?lang=${NONCE}`)).status).toBe(400);
		});
	});

	describe("/tags", () => {
		it("lists tags with counts for a language, by count", async () => {
			const { status, body } = await get<{
				tags: { id: string; label: string; count: number }[];
				total: number;
			}>(`/tags?lang=${LANG}`);
			expect(status).toBe(200);
			expect(body.tags[0]).toEqual({ id: "ghost-stories", label: "Ghost stories", count: 2 });
			expect(body.tags).toContainEqual({ id: UNIQUE_TAG, label: UNIQUE_SUBJECT, count: 1 });
			// The suppressed row's tags are not counted.
			expect(body.tags.find((t) => t.id === "short-stories")?.count).toBe(2);
		});

		it("filters by name and sorts by name", async () => {
			const { body } = await get<{ tags: { id: string }[] }>(
				`/tags?lang=${LANG}&q=stories&sort=name`,
			);
			expect(body.tags.map((t) => t.id)).toEqual(["ghost-stories", "short-stories"]);
		});

		it("returns an empty list for a language with no books", async () => {
			const { body } = await get<{ tags: unknown[]; total: number }>(`/tags?lang=${EMPTY_LANG}`);
			expect(body).toMatchObject({ tags: [], total: 0 });
		});

		it("rejects an unknown sort", async () => {
			const { status } = await get(`/tags?lang=${LANG}&sort=random`);
			expect(status).toBe(400);
		});
	});

	describe("/genres", () => {
		it("returns every genre with a count for the language", async () => {
			const { body } = await get<{ genres: { id: string; label: string; count: number }[] }>(
				`/genres?lang=${LANG}`,
			);
			const byId = Object.fromEntries(body.genres.map((g) => [g.id, g]));
			expect(byId["short-stories"]).toEqual({
				id: "short-stories",
				label: "Short Stories",
				count: 2,
			});
			expect(byId.horror?.count).toBe(3);
			expect(byId.romance?.count).toBe(1);
			expect(byId.poetry?.count).toBe(0);
		});

		it("returns zero counts for a language with no books", async () => {
			const { body } = await get<{ genres: { count: number }[] }>(`/genres?lang=${EMPTY_LANG}`);
			expect(body.genres.length).toBeGreaterThan(8);
			expect(body.genres.every((g) => g.count === 0)).toBe(true);
		});
	});

	describe("/languages", () => {
		it("returns language codes with counts, excluding suppressed rows", async () => {
			const { body } = await get<{ languages: { code: string; count: number }[] }>("/languages");
			expect(body.languages).toContainEqual({ code: LANG, count: 3 });
		});
	});
});
