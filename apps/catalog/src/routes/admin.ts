import { Hono } from "hono";
import { getCounts, invalidateCountsCache } from "../lib/counts.js";
import { requireAdmin } from "../middleware/bearer-auth.js";
import { getSyncState, runSync, type Source } from "../sync/orchestrator.js";

const VALID_SOURCES: readonly Source[] = ["gutenberg", "standard_ebooks", "all"];

function isSource(value: unknown): value is Source {
	return typeof value === "string" && (VALID_SOURCES as readonly string[]).includes(value);
}

export const adminRoute = new Hono()
	.use("*", requireAdmin)
	.post("/sync", async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as { source?: unknown };
		if (body.source !== undefined && !isSource(body.source)) {
			return c.json({ error: "invalid source" }, 400);
		}
		const source: Source = isSource(body.source) ? body.source : "all";

		// Fire-and-forget; orchestrator guards against concurrent runs
		void runSync(source);
		// Invalidate counts cache so the next /stats poll reflects the fresh run.
		invalidateCountsCache();
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
