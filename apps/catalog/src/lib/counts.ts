import { count } from "drizzle-orm";
import { db } from "../db/index.js";
import { catalogBooks } from "../db/schema.js";

export type Counts = {
	gutenberg: number;
	standardEbooks: number;
	suppressed: number;
	total: number;
};

const COUNTS_TTL_MS = 10_000;
let countsCache: { at: number; value: Counts } | null = null;

export async function getCounts(): Promise<Counts> {
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

	const value: Counts = {
		gutenberg,
		standardEbooks,
		suppressed,
		total: gutenberg + standardEbooks,
	};
	countsCache = { at: now, value };
	return value;
}

export function invalidateCountsCache() {
	countsCache = null;
}
