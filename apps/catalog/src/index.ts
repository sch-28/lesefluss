import { type HttpBindings, serve } from "@hono/node-server";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import cron from "node-cron";
import { db } from "./db/index.js";
import { migrate } from "./db/migrate.js";
import { env } from "./env.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { adminRoute } from "./routes/admin.js";
import { booksRoute } from "./routes/books.js";
import { coversRoute } from "./routes/covers.js";
import { healthRoute } from "./routes/health.js";
import { landingRoute } from "./routes/landing.js";
import { searchRoute } from "./routes/search.js";
import { shelvesRoute } from "./routes/shelves.js";
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

	app.use("*", rateLimit);
	app.route("/search", searchRoute);
	app.route("/landing", landingRoute);
	app.route("/shelves", shelvesRoute);
	app.route("/books", booksRoute);
	app.route("/covers", coversRoute);
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
