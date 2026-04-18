import { count } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { catalogBooks } from "../db/schema.js";
import { requireAdmin } from "../middleware/bearer-auth.js";
import { getSyncState, runSync, type Source } from "../sync/orchestrator.js";

const VALID_SOURCES: readonly Source[] = ["gutenberg", "standard_ebooks", "all"];

type Counts = { gutenberg: number; standardEbooks: number; suppressed: number; total: number };
const COUNTS_TTL_MS = 10_000;
let countsCache: { at: number; value: Counts } | null = null;

async function getCounts(): Promise<Counts> {
	const now = Date.now();
	if (countsCache && now - countsCache.at < COUNTS_TTL_MS) return countsCache.value;

	const rows = await db
		.select({
			source: catalogBooks.source,
			suppressed: catalogBooks.suppressed,
			count: count(),
		})
		.from(catalogBooks)
		.groupBy(catalogBooks.source, catalogBooks.suppressed);

	let gutenberg = 0;
	let standardEbooks = 0;
	let suppressed = 0;
	for (const r of rows) {
		if (r.suppressed) {
			suppressed += r.count;
			continue;
		}
		if (r.source === "gutenberg") gutenberg += r.count;
		else if (r.source === "standard_ebooks") standardEbooks += r.count;
	}

	const value: Counts = { gutenberg, standardEbooks, suppressed, total: gutenberg + standardEbooks };
	countsCache = { at: now, value };
	return value;
}

export const adminRoute = new Hono()
	.use("*", requireAdmin)
	.post("/sync", async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as { source?: string };
		if (body.source && !VALID_SOURCES.includes(body.source as Source)) {
			return c.json({ error: "invalid source" }, 400);
		}
		const source: Source = (body.source as Source) ?? "all";

		// Fire-and-forget; orchestrator guards against concurrent runs
		void runSync(source);
		// Invalidate counts cache so the next /stats poll reflects the fresh run.
		countsCache = null;
		return c.json({ accepted: true, source }, 202);
	})
	.get("/stats", async (c) => {
		const sync = getSyncState();
		const counts = await getCounts();

		return c.json({
			sync: {
				running: sync.running,
				currentSource: sync.currentSource,
				phase: sync.phase,
				booksUpserted: sync.booksUpserted,
				booksSuppressed: sync.booksSuppressed,
				lastStartedAt: sync.lastStartedAt ? sync.lastStartedAt.toISOString() : null,
				lastFinishedAt: sync.lastFinishedAt ? sync.lastFinishedAt.toISOString() : null,
				lastError: sync.lastError,
			},
			counts,
		});
	});
