import { useMemo } from "react";
import { queryHooks } from "../../services/db/hooks";
import { normalizeSeriesUrl } from "../../services/serial-scrapers";

/** normalized series URL → series id, derived from the library's series list. */
export function useLibrarySeriesByUrl(): Map<string, string> | undefined {
	const { data } = queryHooks.useSeriesList();
	return useMemo(() => {
		if (!data) return undefined;
		return new Map(data.map((s) => [normalizeSeriesUrl(s.sourceUrl), s.id]));
	}, [data]);
}
