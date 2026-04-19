import { Hono } from "hono";
import { getCounts } from "../lib/counts.js";

/**
 * Public catalog counts — no sync state, no bearer. Safe to call from landing
 * pages and other high-traffic surfaces. Backed by a 10s in-memory cache in
 * getCounts(), so hammering this route is cheap.
 */
export const statsRoute = new Hono().get("/", async (c) => {
	const counts = await getCounts();
	c.header("Cache-Control", "public, max-age=60");
	return c.json({ counts });
});
