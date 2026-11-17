import { useQuery } from "@tanstack/react-query";
import { type CatalogGenresResponse, getGenres } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";

const GENRES_STALE_TIME_MS = 60 * 60 * 1000;
const STORAGE_PREFIX = "explore-genres:";

type Stored = { at: number; data: CatalogGenresResponse };

function readStoredGenres(lang: string): Stored | undefined {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + lang) ?? "null");
		if (!parsed || typeof parsed !== "object") return undefined;
		const { at, data } = parsed as Partial<Stored>;
		if (typeof at !== "number" || !Array.isArray(data?.genres)) return undefined;
		return { at, data };
	} catch {
		return undefined;
	}
}

function storeGenres(lang: string, data: CatalogGenresResponse): void {
	try {
		localStorage.setItem(STORAGE_PREFIX + lang, JSON.stringify({ at: Date.now(), data }));
	} catch {
		// Without storage the chips just wait for the request, as before.
	}
}

/**
 * Genre ids, labels and counts for a language. The catalog counts them with a
 * full-table scan that it caches for only ten minutes, so a cold request can
 * take seconds; the last answer is kept on the device and shown at once while
 * a stale one refreshes in the background.
 */
export function useCatalogGenres(lang: string, enabled = true) {
	return useQuery({
		queryKey: catalogKeys.genres(lang),
		queryFn: async ({ signal }) => {
			const res = await getGenres(lang, signal);
			storeGenres(lang, res);
			return res;
		},
		enabled,
		staleTime: GENRES_STALE_TIME_MS,
		initialData: () => readStoredGenres(lang)?.data,
		initialDataUpdatedAt: () => readStoredGenres(lang)?.at,
	});
}
