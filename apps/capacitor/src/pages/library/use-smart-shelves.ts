import { useCallback, useMemo, useSyncExternalStore } from "react";
import { createRequest } from "../../commands/signal";
import { queryHooks } from "../../services/db/hooks";
import type { SeriesActivity } from "../../services/db/queries/series";
import type { Book, Series } from "../../services/db/schema";
import { facetOptions } from "./filter-picker";
import {
	BUILT_IN_PINS_KEY,
	builtInShelves,
	orderShelves,
	parseBuiltInPins,
	type ShelfEntry,
	shelfCounts,
	shelfEntryOf,
} from "./smart-shelves";
import { buildLibraryItems } from "./sort-filter";
import { useLibraryItems } from "./use-library-items";

/** Answered by the library page, which owns the filter picker. */
export const editShelfConditionsRequest = createRequest();

const pinListeners = new Set<() => void>();

function readPins(): string | null {
	try {
		return localStorage.getItem(BUILT_IN_PINS_KEY);
	} catch {
		return null;
	}
}

function subscribePins(listener: () => void) {
	pinListeners.add(listener);
	return () => {
		pinListeners.delete(listener);
	};
}

function writePins(pins: ReadonlySet<string>) {
	try {
		localStorage.setItem(BUILT_IN_PINS_KEY, JSON.stringify([...pins]));
	} catch {
		// best-effort: private mode / quota / disabled storage
	}
	for (const listener of pinListeners) listener();
}

type ShelfLibrary = {
	items: ReturnType<typeof buildLibraryItems>;
	options: ReturnType<typeof facetOptions>;
};

const EMPTY_LIBRARY: ShelfLibrary = { items: [], options: facetOptions([], []) };

// The library page, the phone shelf row, the sidebar and the save dialogs all
// read this; the query caches hand every caller the same arrays, so one slot
// keyed on them derives the library once per change instead of once per caller.
let lastLibrary: { inputs: readonly unknown[]; value: ShelfLibrary } | null = null;

type LibraryInputs = [
	books: Book[],
	series: Series[],
	seriesActivity: Map<string, SeriesActivity>,
	memberships: ReadonlyMap<string, readonly string[]> | undefined,
	collections: readonly { id: string; name: string }[] | undefined,
];

function deriveShelfLibrary(inputs: LibraryInputs): ShelfLibrary {
	if (lastLibrary?.inputs.every((input, i) => input === inputs[i])) return lastLibrary.value;
	const [books, series, seriesActivity, memberships, collections] = inputs;
	const items = buildLibraryItems(books, series, seriesActivity, Date.now(), memberships);
	const value = { items, options: facetOptions(items, collections) };
	lastLibrary = { inputs, value };
	return value;
}

/** The library as the shelf counts and the save dialog see it: every book, unfiltered.
 *  `enabled: false` skips the derivation for a closed dialog. */
export function useShelfLibrary(enabled = true) {
	const { books, series, seriesActivity, isLoading } = useLibraryItems();
	const memberships = queryHooks.useCollectionMemberships();
	const collections = queryHooks.useCollections();
	const library = useMemo(
		() =>
			enabled
				? deriveShelfLibrary([books, series, seriesActivity, memberships.data, collections.data])
				: EMPTY_LIBRARY,
		[enabled, books, series, seriesActivity, memberships.data, collections.data],
	);
	return { ...library, isLoading: isLoading || memberships.isPending };
}

export function useSmartShelves() {
	const rows = queryHooks.useSmartShelfRows();
	const pinsRaw = useSyncExternalStore(subscribePins, readPins);
	const { items, isLoading } = useShelfLibrary();

	const shelves = useMemo(() => {
		const pins = parseBuiltInPins(pinsRaw);
		return orderShelves([...builtInShelves(pins), ...(rows.data ?? []).map(shelfEntryOf)]);
	}, [pinsRaw, rows.data]);
	const counts = useMemo(() => shelfCounts(shelves, items), [shelves, items]);

	const setBuiltInPinned = useCallback(
		(id: string, pinned: boolean) => {
			const pins = parseBuiltInPins(pinsRaw);
			if (pinned) pins.add(id);
			else pins.delete(id);
			writePins(pins);
		},
		[pinsRaw],
	);

	return {
		shelves,
		counts,
		isLoading: rows.isPending || isLoading,
		isSettled: rows.isSuccess && !rows.isFetching,
		setBuiltInPinned,
	};
}

export type { ShelfEntry };
