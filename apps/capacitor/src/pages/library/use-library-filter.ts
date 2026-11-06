import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import {
	decodeFilterParam,
	encodeFilterParam,
	FILTER_STORAGE_KEY,
	type LibraryFilter,
	loadFilter,
	serializeFilter,
} from "./filter-model";

function readStoredFilter(): LibraryFilter {
	try {
		return loadFilter(localStorage);
	} catch {
		return {};
	}
}

function storeFilter(filter: LibraryFilter): void {
	try {
		localStorage.setItem(FILTER_STORAGE_KEY, serializeFilter(filter));
	} catch {
		// best-effort: private mode / quota / disabled storage
	}
}

/**
 * The library filter. The URL's `f` param is the source of truth, so a view can
 * be bookmarked, reloaded or shared; this device's last filter fills the URL
 * when the library opens without one.
 */
export function useLibraryFilter(): [LibraryFilter, (filter: LibraryFilter) => void] {
	const { f, shelf } = useSearch({ from: "/tabs/library/" });
	const navigate = useNavigate({ from: "/tabs/library/" });
	const fromUrl = useMemo(() => decodeFilterParam(f), [f]);
	// An open shelf's chips are its own, never the device's last filter.
	const filter = useMemo(() => fromUrl ?? (shelf ? {} : readStoredFilter()), [fromUrl, shelf]);

	const setFilter = useCallback(
		(next: LibraryFilter) => {
			if (!shelf) storeFilter(next);
			navigate({ search: (prev) => ({ ...prev, f: encodeFilterParam(next) }), replace: true });
		},
		[navigate, shelf],
	);

	useEffect(() => {
		if (fromUrl && !shelf) storeFilter(fromUrl);
		const canonical = encodeFilterParam(filter);
		if (canonical !== f) {
			navigate({ search: (prev) => ({ ...prev, f: canonical }), replace: true });
		}
	}, [f, fromUrl, filter, navigate, shelf]);

	return [filter, setFilter];
}
