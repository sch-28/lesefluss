import { Hono } from "hono";
import { requireAdmin } from "../middleware/bearer-auth.js";
import { getSyncState, runSync, type Source } from "../sync/orchestrator.js";

const VALID_SOURCES: readonly Source[] = ["gutenberg", "standard_ebooks", "all"];

export const adminRoute = new Hono()
	.use("*", requireAdmin)
	.post("/sync", async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as { source?: string };
		const source: Source =
			body.source && VALID_SOURCES.includes(body.source as Source)
				? (body.source as Source)
				: "all";

		// Fire-and-forget; orchestrator guards against concurrent runs
		void runSync(source);
		return c.json({ accepted: true, source }, 202);
	})
	.get("/stats", (c) => c.json(getSyncState()));
