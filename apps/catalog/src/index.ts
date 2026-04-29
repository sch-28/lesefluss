import { type HttpBindings, serve } from "@hono/node-server";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import cron from "node-cron";
import { db } from "./db/index.js";
import { migrate } from "./db/migrate.js";
import { env } from "./env.js";
import { coversRateLimit, rateLimit } from "./middleware/rate-limit.js";
import { adminRoute } from "./routes/admin.js";
import { booksRoute } from "./routes/books.js";
import { coversRoute } from "./routes/covers.js";
import { healthRoute } from "./routes/health.js";
import { landingRoute } from "./routes/landing.js";
import { proxyRoute } from "./routes/proxy.js";
import { searchRoute } from "./routes/search.js";
import { shelvesRoute } from "./routes/shelves.js";
import { statsRoute } from "./routes/stats.js";
import { runSync } from "./sync/orchestrator.js";

async function main() {
	await migrate();

	const app = new Hono<{ Bindings: HttpBindings }>();

	// CORS: all catalog endpoints are public reads, no credentials. Allow any
	// origin in dev and explicit origins listed via CATALOG_ALLOWED_ORIGINS
	// (comma-separated) in production. The capacitor app and the web embed both
	// call this service from the browser.
	const allowedOrigins = (process.env.CATALOG_ALLOWED_ORIGINS ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	app.use(
		"*",
		cors({
			origin: (origin) => {
				if (process.env.NODE_ENV !== "production") return origin ?? "*";
				if (!origin) return "";
				return allowedOrigins.includes(origin) ? origin : "";
			},
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: ["Authorization", "Content-Type"],
			maxAge: 86400,
		}),
	);

	// Health first, no rate limit
	app.route("/health", healthRoute);

	// Covers get their own generous bucket — first paint of the landing-page
	// marquee or the app's Explore grid easily fires ~25 requests at once, which
	// would tip the 60/min API bucket into 429s. Mount before the shared limiter
	// so the two don't stack.
	app.use("/covers/*", coversRateLimit);
	app.route("/covers", coversRoute);

	// Image proxy shares the cover-image use case (web-novel search grids fire
	// 10–20 cover loads on first paint), so reuse the generous covers bucket
	// instead of the default 60/min API bucket.
	app.use("/proxy/image", coversRateLimit);

	app.use("*", rateLimit);
	app.route("/search", searchRoute);
	app.route("/landing", landingRoute);
	app.route("/shelves", shelvesRoute);
	app.route("/stats", statsRoute);
	app.route("/books", booksRoute);
	app.route("/proxy", proxyRoute);
	app.route("/admin", adminRoute);

	serve({ fetch: app.fetch, port: env.PORT }, (info) => {
		console.log(`[catalog] listening on :${info.port}`);
	});

	// Background initial seed if empty
	const { rows } = await db.execute<{ count: number }>(
		sql`SELECT count(*)::int AS count FROM catalog_books`,
	);
	if ((rows[0]?.count ?? 0) === 0) {
		console.log("[catalog] empty DB, triggering initial seed in background");
		void runSync("all");
	} else {
		console.log(`[catalog] DB has ${rows[0]?.count} books, skipping initial seed`);
	}

	// Weekly cron: Sunday 03:00
	cron.schedule("0 3 * * 0", () => {
		console.log("[catalog] weekly sync triggered");
		void runSync("all");
	});
}

main().catch((err) => {
	console.error("[catalog] fatal startup error:", err);
	process.exit(1);
});
