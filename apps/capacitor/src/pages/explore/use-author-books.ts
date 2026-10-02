import { useQuery } from "@tanstack/react-query";
import { searchCatalog } from "../../services/catalog/client";
import { catalogKeys } from "../../services/catalog/query-keys";

/** How long side shelves (author, similar) stay fresh; they change with weekly syncs. */
export const SHELF_STALE_TIME_MS = 10 * 60 * 1000;

/**
 * One author's catalog books in every language, most popular first. Author
 * links navigate with `lang: "all"` too, so the shelf and its results agree.
 */
export function useAuthorBooks(author: string | null | undefined, limit: number) {
	return useQuery({
		queryKey: catalogKeys.byAuthor(author ?? "", limit),
		queryFn: ({ signal }) =>
			searchCatalog({ q: "", lang: "all", author: author ?? "", sort: "popular", limit, signal }),
		enabled: !!author,
		staleTime: SHELF_STALE_TIME_MS,
	});
}
