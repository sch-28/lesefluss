import { backfillDerivedColumns, cleanStoredTitles, retagAll } from "../sync/backfill.js";
import { migrate } from "./migrate.js";

// `--retag` re-derives every row's tags, for after a change to lib/tags.ts.
const retag = process.argv.includes("--retag");

migrate()
	.then(async () => {
		const titles = await cleanStoredTitles();
		const { updated } = retag ? await retagAll() : await backfillDerivedColumns();
		console.log(
			`[backfill] cleaned ${titles} title(s), ${retag ? "retagged" : "updated"} ${updated} row(s)`,
		);
		process.exit(0);
	})
	.catch((err) => {
		console.error("[backfill] failed:", err);
		process.exit(1);
	});
