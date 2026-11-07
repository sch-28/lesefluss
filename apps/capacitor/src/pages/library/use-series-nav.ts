import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { queryHooks } from "../../services/db/hooks";
import { buildSeriesEntries, type SeriesEntry, seriesEntryKey } from "./series-nav";

const EMPTY_MAP = new Map();

/** Book series and serials for the Series lists, with live counts, newest read first. */
export function useSeriesEntries(): {
	entries: SeriesEntry[];
	covers: ReadonlyMap<string, string>;
} {
	const collections = queryHooks.useCollections().data;
	const seriesMemberships = queryHooks.useSeriesMemberships().data;
	const books = queryHooks.useBooks().data;
	const serials = queryHooks.useSeriesList().data;
	const chapterCounts = queryHooks.useSeriesChapterCounts().data;
	const serialActivity = queryHooks.useSeriesActivity().data;

	const entries = useMemo(
		() =>
			buildSeriesEntries({
				collections: collections ?? [],
				seriesMemberships: seriesMemberships ?? EMPTY_MAP,
				books: books?.books ?? [],
				serials: serials ?? [],
				chapterCounts: chapterCounts ?? EMPTY_MAP,
				serialActivity: serialActivity ?? EMPTY_MAP,
			}),
		[collections, seriesMemberships, books, serials, chapterCounts, serialActivity],
	);
	return { entries, covers: books?.covers ?? EMPTY_MAP };
}

export const ALL_SERIES_PATH = "/tabs/library/all-series";

export function useOpenSeries(): (entry: Pick<SeriesEntry, "kind" | "id">) => void {
	const navigate = useNavigate();
	return useCallback(
		(entry) => {
			if (entry.kind === "serial") {
				navigate({ to: "/tabs/library/series/$id", params: { id: entry.id } });
			} else {
				navigate({ to: "/tabs/library", search: { collection: entry.id } });
			}
		},
		[navigate],
	);
}

/** The series the current page shows, as `seriesEntryKey`, or "all" on All series. */
export function useActiveSeriesKey(): string | undefined {
	const { pathname, search } = useLocation();
	if (pathname === ALL_SERIES_PATH) return "all";
	if (pathname === "/tabs/library") {
		const id = (search as { collection?: string }).collection;
		return id ? seriesEntryKey({ kind: "book", id }) : undefined;
	}
	const serial = /^\/tabs\/library\/series\/([^/]+)$/.exec(pathname);
	return serial?.[1]
		? seriesEntryKey({ kind: "serial", id: decodeURIComponent(serial[1]) })
		: undefined;
}
