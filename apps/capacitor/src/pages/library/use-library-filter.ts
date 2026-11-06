import { useEffect, useState } from "react";
import {
	FILTER_STORAGE_KEY,
	type LibraryFilter,
	loadFilter,
	serializeFilter,
} from "./filter-model";

function readFilter(): LibraryFilter {
	try {
		return loadFilter(localStorage);
	} catch {
		return {};
	}
}

/** The library filter, kept on this device across launches. */
export function useLibraryFilter(): [LibraryFilter, (filter: LibraryFilter) => void] {
	const [filter, setFilter] = useState(readFilter);
	useEffect(() => {
		try {
			localStorage.setItem(FILTER_STORAGE_KEY, serializeFilter(filter));
		} catch {
			// best-effort: private mode / quota / disabled storage
		}
	}, [filter]);
	return [filter, setFilter];
}
