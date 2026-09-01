import { Hono } from "hono";
import {
	type DictImportTarget,
	getDictImportState,
	isDictImportTarget,
	runDictImport,
} from "../dict/import.js";
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
	// Manual only — no cron, no boot seed. Each run pulls hundreds of MB from
	// kaikki.org, and Wiktionary dumps move slowly enough that a re-import is a
	// deliberate, occasional act.
	.post("/dictionary/import", async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as { lang?: unknown };
		if (body.lang !== undefined && !isDictImportTarget(body.lang)) {
			return c.json({ error: "invalid lang" }, 400);
		}
		const lang: DictImportTarget = isDictImportTarget(body.lang) ? body.lang : "all";

		// Fire-and-forget; runDictImport guards against concurrent runs.
		void runDictImport(lang);
		return c.json({ accepted: true, lang }, 202);
	})
	.get("/stats", async (c) => {
		const sync = getSyncState();
		const dict = getDictImportState();
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
			dict: {
				running: dict.running,
				currentLang: dict.currentLang,
				phase: dict.phase,
				linesRead: dict.linesRead,
				rowsWritten: dict.rowsWritten,
				rowsReplaced: dict.rowsReplaced,
				stats: dict.stats,
				lastStartedAt: dict.lastStartedAt ? dict.lastStartedAt.toISOString() : null,
				lastFinishedAt: dict.lastFinishedAt ? dict.lastFinishedAt.toISOString() : null,
				lastError: dict.lastError,
			},
			counts,
		});
	});
