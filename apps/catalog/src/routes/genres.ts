import { Hono } from "hono";
import { genreCounts } from "../lib/genre-counts.js";
import { parseLang } from "../lib/language.js";

export const genresRoute = new Hono().get("/", async (c) => {
	const lang = parseLang(c.req.query("lang"));
	if (!lang) return c.json({ error: "invalid lang" }, 400);
	const genres = await genreCounts.get(lang);
	return c.json({ lang, genres });
});
