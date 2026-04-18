import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { catalogBooks } from "../db/schema.js";

const VALID_SOURCES = new Set(["gutenberg", "se"]);

/**
 * Cover proxy. URL path: /covers/:source/:rest — :rest captures the source-specific id
 * (slug for SE, numeric id for Gutenberg). Caches aggressively. Node's fetch does
 * not send a Referer header, so the spec's "strip Referer" requirement is met implicitly.
 */
export const coversRoute = new Hono().get("/:source/:rest{.+}", async (c) => {
	const source = c.req.param("source");
	const rest = c.req.param("rest");
	if (!source || !rest) return c.json({ error: "missing id" }, 400);
	if (!VALID_SOURCES.has(source)) return c.json({ error: "unknown source" }, 400);

	// Map URL source segment to stored id prefix. Table uses "standard_ebooks" internally
	// but the URL uses the shorter "se" per the agents spec.
	const idPrefix = source === "se" ? "se" : source;
	const id = `${idPrefix}:${decodeURIComponent(rest)}`;

	const rows = await db
		.select({ coverUrl: catalogBooks.coverUrl })
		.from(catalogBooks)
		.where(eq(catalogBooks.id, id))
		.limit(1);

	const coverUrl = rows[0]?.coverUrl;
	if (!coverUrl) return c.json({ error: "no cover" }, 404);

	const upstream = await fetch(coverUrl);
	if (!upstream.ok || !upstream.body) return c.json({ error: "upstream failed" }, 502);

	c.header("Content-Type", upstream.headers.get("content-type") ?? "image/jpeg");
	c.header("Cache-Control", "public, max-age=604800");
	return c.body(upstream.body);
});
