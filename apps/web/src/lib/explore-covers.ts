import { createServerFn } from "@tanstack/react-start";
import { catalogFetch } from "./catalog";

export type ExploreCover = {
	id: string;
	title: string;
	author: string;
	coverUrl: string;
};

export type CatalogCounts = {
	total: number;
	standardEbooks: number;
	gutenberg: number;
};

async function readJsonSafe<T>(res: Response): Promise<T | null> {
	try {
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

type PublicStatsResponse = {
	counts?: {
		total?: number;
		standardEbooks?: number;
		gutenberg?: number;
	};
};

const COUNTS_TTL_MS = 5 * 60_000;
let countsCache: { at: number; value: CatalogCounts | null } | null = null;
let inflightCounts: Promise<CatalogCounts | null> | null = null;

async function fetchCounts(): Promise<CatalogCounts | null> {
	const r = await catalogFetch("/stats", { timeoutMs: 4000 });
	if (!r.ok || !r.data.ok) return null;
	const data = await readJsonSafe<PublicStatsResponse>(r.data);
	const c = data?.counts;
	if (!c) return null;
	return {
		total: c.total ?? 0,
		standardEbooks: c.standardEbooks ?? 0,
		gutenberg: c.gutenberg ?? 0,
	};
}

export const getCatalogCounts = createServerFn({ method: "GET" }).handler(
	async (): Promise<CatalogCounts | null> => {
		const now = Date.now();
		if (countsCache && now - countsCache.at < COUNTS_TTL_MS) return countsCache.value;

		// Dedupe concurrent cold-cache hits so we don't fan out N catalog calls.
		if (!inflightCounts) {
			inflightCounts = fetchCounts().finally(() => {
				inflightCounts = null;
			});
		}
		const value = await inflightCounts;
		// Only cache successes; failures should retry on the next request.
		if (value !== null) countsCache = { at: Date.now(), value };
		return value;
	},
);
