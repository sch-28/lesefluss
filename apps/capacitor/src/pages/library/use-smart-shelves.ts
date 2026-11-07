import type { SpeedModel } from "@lesefluss/core";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useLocalDayNow } from "../../hooks/use-local-day";
import { queryHooks } from "../../services/db/hooks";
import type { SeriesActivity } from "../../services/db/queries/series";
import type { Book, Series } from "../../services/db/schema";
import { isFirstLoad } from "../../services/query-client";
import { facetOptions } from "./filter-picker";
import {
	BUILT_IN_PINS_KEY,
	builtInShelves,
	orderShelves,
	parseBuiltInPins,
	type ShelfEntry,
	shelfCounts,
	shelfEntryOf,
	withBuiltInPin,
} from "./smart-shelves";
import { buildLibraryItems } from "./sort-filter";
import { useLibraryItems } from "./use-library-items";

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

function writePins(value: string) {
	try {
		localStorage.setItem(BUILT_IN_PINS_KEY, value);
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
	speedModel: SpeedModel | undefined,
];

function deriveShelfLibrary(inputs: LibraryInputs): ShelfLibrary {
	if (lastLibrary?.inputs.every((input, i) => input === inputs[i])) return lastLibrary.value;
	const [books, series, seriesActivity, memberships, collections, speedModel] = inputs;
	const items = buildLibraryItems(
		books,
		series,
		seriesActivity,
		Date.now(),
		memberships,
		speedModel,
	);
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
	const speedModel = queryHooks.useStatsSpeedModel();
	const library = useMemo(
		() =>
			enabled
				? deriveShelfLibrary([
						books,
						series,
						seriesActivity,
						memberships.data,
						collections.data,
						speedModel.data,
					])
				: EMPTY_LIBRARY,
		[enabled, books, series, seriesActivity, memberships.data, collections.data, speedModel.data],
	);
	return { ...library, isLoading: isLoading || isFirstLoad(memberships) };
}

export function useSmartShelves() {
	const rows = queryHooks.useSmartShelfRows();
	const pinsRaw = useSyncExternalStore(subscribePins, readPins);
	const { items, isLoading } = useShelfLibrary();
	const now = useLocalDayNow();

	const shelves = useMemo(() => {
		const pins = parseBuiltInPins(pinsRaw);
		return orderShelves([...builtInShelves(pins), ...(rows.data ?? []).map(shelfEntryOf)]);
	}, [pinsRaw, rows.data]);
	const counts = useMemo(() => shelfCounts(shelves, items, now), [shelves, items, now]);

	const setBuiltInPinned = useCallback(
		(id: string, pinned: boolean) => writePins(withBuiltInPin(pinsRaw, id, pinned)),
		[pinsRaw],
	);

	return {
		shelves,
		counts,
		isLoading: isFirstLoad(rows) || isLoading,
		isSettled: rows.isSuccess && !rows.isFetching,
		setBuiltInPinned,
	};
}

export type { ShelfEntry };
