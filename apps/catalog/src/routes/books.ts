import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { catalogBooks } from "../db/schema.js";

export const booksRoute = new Hono().get("/:id{.+}", async (c) => {
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
