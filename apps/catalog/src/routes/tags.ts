import { Hono } from "hono";
import { parseLang } from "../lib/language.js";
import { parsePositiveInt } from "../lib/search-params.js";
import { cachedTagCounts } from "../lib/tag-counts.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const TAG_SORTS = ["count", "name"] as const;
type TagSort = (typeof TAG_SORTS)[number];

function isTagSort(v: string): v is TagSort {
	return (TAG_SORTS as readonly string[]).includes(v);
}

export const tagsRoute = new Hono().get("/", async (c) => {
	const lang = parseLang(c.req.query("lang"));
	if (!lang) return c.json({ error: "invalid lang" }, 400);
	const sort = c.req.query("sort") ?? "count";
	if (!isTagSort(sort)) return c.json({ error: "invalid sort" }, 400);
	const q = c.req.query("q")?.trim().toLowerCase() ?? "";
	const limit = parsePositiveInt(c.req.query("limit"), DEFAULT_LIMIT, MAX_LIMIT);

	const all = await cachedTagCounts(lang);
	const matching = q ? all.filter((t) => t.label.toLowerCase().includes(q)) : all;
	const sorted =
		sort === "name" ? [...matching].sort((a, b) => a.label.localeCompare(b.label)) : matching;

	return c.json({
		lang,
		q,
		sort,
		total: matching.length,
		tags: sorted.slice(0, limit),
	});
});
