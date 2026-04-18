import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { catalogBooks } from "../db/schema.js";
import { env } from "../env.js";
import { epubRateLimit } from "../middleware/rate-limit.js";

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
			.select({ epubUrl: catalogBooks.epubUrl, source: catalogBooks.source })
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
		return c.body(upstream.body);
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
		return c.json({
			id: book.id,
			source: book.source,
			title: book.title,
			author: book.author,
			language: book.language,
			subjects: book.subjects,
			summary: book.summary,
			description: book.description,
			epubUrl: book.epubUrl,
			coverUrl: book.coverUrl,
		});
	});
