import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { catalogBooks, catalogTags } from "../db/schema.js";
import { env } from "../env.js";
import { authorKeys, splitAuthors } from "../lib/authors.js";
import { type BookRow, mapBookRow } from "../lib/book-row.js";
import { getCounts } from "../lib/counts.js";
import { displayAuthor } from "../lib/display.js";
import { MAX_EPUB_BYTES } from "../lib/epub-limits.js";
import { effectiveLength } from "../lib/length-estimate.js";
import { similarityWeights } from "../lib/similarity.js";
import { textArray } from "../lib/sql-array.js";
import { cachedTagCounts } from "../lib/tag-counts.js";
import { epubRateLimit } from "../middleware/rate-limit.js";
import { countFromProxiedStream } from "../sync/proxy-word-count.js";

const SIMILAR_LIMIT = 12;
const countingIds = new Set<string>();

export const booksRoute = new Hono()
	// EPUB proxy. Mounted on `/epub/:id{.+}` to avoid a routing collision with
	// the detail wildcard below — Hono's RegExpRouter lets `/:id{.+}` greedily
	// swallow `/:id{.+}/epub` when the ids themselves contain slashes, sending
	// SE epub requests (`se:author/title`) into the detail handler.
	// For standard_ebooks, forward HTTP Basic auth (patron subscription required).
	// Gutenberg URLs are public. Uses a stricter per-IP bucket on top of the
	// global API rate limit because responses are multi-megabyte.
	.get("/epub/:id{.+}", epubRateLimit, async (c) => {
		const raw = c.req.param("id");
		if (!raw) return c.json({ error: "missing id" }, 400);
		const id = decodeURIComponent(raw);

		const rows = await db
			.select({
				epubUrl: catalogBooks.epubUrl,
				source: catalogBooks.source,
				wordCount: catalogBooks.wordCount,
				wordCountEpubUrl: catalogBooks.wordCountEpubUrl,
			})
			.from(catalogBooks)
			.where(and(eq(catalogBooks.id, id), eq(catalogBooks.suppressed, false)))
			.limit(1);

		const book = rows[0];
		if (!book?.epubUrl) return c.json({ error: "no epub" }, 404);

		const headers: Record<string, string> = {};
		if (book.source === "standard_ebooks" && env.SE_EMAIL && env.SE_PASSWORD) {
			const auth = Buffer.from(`${env.SE_EMAIL}:${env.SE_PASSWORD}`).toString("base64");
			headers.Authorization = `Basic ${auth}`;
		}

		let upstream: Response;
		try {
			upstream = await fetch(book.epubUrl, {
				headers,
				signal: AbortSignal.timeout(30_000),
			});
		} catch (err) {
			console.warn("[epub] upstream fetch failed:", err);
			return c.json({ error: "upstream failed" }, 502);
		}
		if (!upstream.ok || !upstream.body) return c.json({ error: "upstream failed" }, 502);

		c.header("Content-Type", upstream.headers.get("content-type") ?? "application/epub+zip");
		const len = upstream.headers.get("content-length");
		if (len) c.header("Content-Length", len);
		c.header("Cache-Control", "public, max-age=604800");

		// Counting tees the stream, and the reader's branch buffers whatever the
		// counting branch has read ahead of it. Only tee a body of known, bounded
		// size, and only one count per book at a time.
		const length = Number(len ?? 0);
		const needsCount =
			(book.wordCount === null || book.wordCountEpubUrl !== book.epubUrl) &&
			length > 0 &&
			length <= MAX_EPUB_BYTES &&
			!countingIds.has(id);
		if (!needsCount) return c.body(upstream.body);
		const [toClient, toCount] = upstream.body.tee();
		countingIds.add(id);
		void countFromProxiedStream(id, book.epubUrl, toCount).finally(() => countingIds.delete(id));
		return c.body(toClient);
	})
	// Before the detail wildcard, which would otherwise swallow `similar/...` as an id.
	.get("/similar/:id{.+}", async (c) => {
		const raw = c.req.param("id");
		if (!raw) return c.json({ error: "missing id" }, 400);
		const id = decodeURIComponent(raw);
		const target = await db
			.select({ tags: catalogBooks.tags })
			.from(catalogBooks)
			.where(eq(catalogBooks.id, id))
			.limit(1);
		const [counts, totals] = await Promise.all([cachedTagCounts("all"), getCounts()]);
		const { weights, specific } = similarityWeights(
			target[0]?.tags ?? [],
			new Map(counts.map((t) => [t.id, t.count])),
			totals.total,
		);
		if (specific.length === 0) return c.json({ results: [] });

		const weightRows = sql.join(
			weights.map((w) => sql`(${w.id}::text, ${w.weight}::float8)`),
			sql`, `,
		);
		const { rows } = await db.execute<BookRow>(sql`
			WITH target AS (
				SELECT author_keys, split_part(coalesce(language, ''), '-', 1) AS lang
				FROM catalog_books WHERE id = ${id}
			), w(tag, weight) AS (VALUES ${weightRows})
			SELECT b.id, b.source, b.title, b.author, b.language, b.subjects, b.summary, b.cover_url,
				b.epub_url IS NOT NULL AS has_epub, b.word_count, b.word_count_estimate
			FROM catalog_books b
			CROSS JOIN target t
			CROSS JOIN LATERAL unnest(b.tags) AS bt(tag)
			JOIN w ON w.tag = bt.tag
			WHERE b.id <> ${id}
				AND b.suppressed = false
				AND b.tags && ${textArray(specific)}
				AND (b.language = t.lang OR b.language LIKE t.lang || '-%')
				AND NOT (coalesce(b.author_keys, '{}') && coalesce(t.author_keys, '{}'))
			GROUP BY b.id
			ORDER BY sum(w.weight) DESC, b.download_count DESC NULLS LAST, b.id
			LIMIT ${SIMILAR_LIMIT * 2}
		`);
		// Gutenberg often has several editions of one work; show it once.
		const seenTitles = new Set<string>();
		const distinct = rows
			.filter((r) => {
				const author = r.author ? authorKeys(splitAuthors(r.author))[0] : "";
				const key = `${r.title.split(":")[0]?.trim().toLowerCase()}|${author ?? ""}`;
				if (seenTitles.has(key)) return false;
				seenTitles.add(key);
				return true;
			})
			.slice(0, SIMILAR_LIMIT);
		return c.json({ results: distinct.map(mapBookRow) });
	})
	.get("/:id{.+}", async (c) => {
		const raw = c.req.param("id");
		if (!raw) return c.json({ error: "missing id" }, 400);
		const id = decodeURIComponent(raw);

		const rows = await db
			.select()
			.from(catalogBooks)
			.where(and(eq(catalogBooks.id, id), eq(catalogBooks.suppressed, false)))
			.limit(1);

		const book = rows[0];
		if (!book) return c.json({ error: "not found" }, 404);

		const tagIds = book.tags ?? [];
		const labelRows =
			tagIds.length > 0
				? await db.select().from(catalogTags).where(inArray(catalogTags.id, tagIds))
				: [];
		const labels = new Map(labelRows.map((t) => [t.id, t.label]));

		return c.json({
			id: book.id,
			source: book.source,
			title: book.title,
			author: displayAuthor(book.author, book.source),
			language: book.language,
			subjects: book.subjects,
			summary: book.summary,
			description: book.description,
			epubUrl: book.epubUrl,
			coverUrl: book.coverUrl,
			...effectiveLength(book.wordCount, book.wordCountEstimate),
			authorBirthYear: book.authorBirthYear,
			authorDeathYear: book.authorDeathYear,
			tags: tagIds.flatMap((id) => {
				const label = labels.get(id);
				return label ? [{ id, label }] : [];
			}),
		});
	});
