import { useInfiniteQuery } from "@tanstack/react-query";
import { type CatalogSearchResponse, searchCatalog } from "../../services/catalog/client";
import { type CatalogSearchFilters, catalogKeys } from "../../services/catalog/query-keys";
import { rememberTagLabels } from "./tag-labels";

const CATALOG_PAGE_SIZE = 24;
const CATALOG_MAX_OFFSET = 10_000;
const SEARCH_STALE_TIME_MS = 5 * 60 * 1000;

export function nextCatalogPage(
	last: CatalogSearchResponse,
	pages: CatalogSearchResponse[],
): number | undefined {
	const loaded = pages.reduce((n, p) => n + p.results.length, 0);
	if (loaded >= last.total || last.results.length === 0) return undefined;
	// The catalog refuses offsets past its cap, so stop before asking.
	if (last.page * last.limit >= CATALOG_MAX_OFFSET) return undefined;
	return last.page + 1;
}

/**
 * Catalog results for one filter set. The results grid and the filter row
 * above it both call this; React Query shares the one request.
 */
export function useCatalogSearch(filters: CatalogSearchFilters, enabled = true) {
	return useInfiniteQuery({
		enabled,
		queryKey: catalogKeys.search(filters),
		queryFn: async ({ pageParam, signal }) => {
			const page = await searchCatalog({
				...filters,
				limit: CATALOG_PAGE_SIZE,
				withTagFacets: pageParam === 1,
				page: pageParam,
				signal,
			});
			rememberTagLabels(page.facets?.tags);
			return page;
		},
		initialPageParam: 1,
		getNextPageParam: nextCatalogPage,
		staleTime: SEARCH_STALE_TIME_MS,
	});
}
