import { useEffect, useMemo, useState } from "react";
import { usePersistentString } from "../../hooks/use-persistent-string";
import { type GroupBy, isGroupBy } from "./group-by";
import { type LibraryLayout, resolveLayout, writeShelfView } from "./shelf-view";
import { isSortBy, type SortState } from "./sort-filter";
import type { ThenBy } from "./sort-popover";
import {
	type ColumnId,
	columnsOf,
	DEFAULT_COLUMNS,
	moveColumn,
	parseColumns,
	serializeColumns,
	toggleColumn,
} from "./table-columns";

const SORT_BY_KEY = "lesefluss:library-sort";
const THEN_BY_KEY = "lesefluss:library-sort-then";
const SORT_REVERSED_KEY = "lesefluss:library-sort-reversed";
const THEN_REVERSED_KEY = "lesefluss:library-sort-then-reversed";
const GROUP_BY_KEY = "lesefluss:library-group";
const COLUMNS_KEY = "lesefluss:library-columns";

const isThenBy = (value: string): value is ThenBy => value === "none" || isSortBy(value);
const isFlag = (value: string): value is "0" | "1" => value === "0" || value === "1";
const isAnyString = (value: string): value is string => typeof value === "string";

/** A collection or user-made shelf that is open: its stored `view` and how to save one. */
export type ShelfViewTarget = {
	id: string;
	view: string | null;
	save: (view: string) => void;
};

/**
 * The library's sort, group-by and columns. Sort is always this device's; group-by
 * and columns are the open shelf's own once it has some, else this device's.
 */
export function useLibraryView(shelf: ShelfViewTarget | null) {
	const [sortBy, setSortBy] = usePersistentString(SORT_BY_KEY, isSortBy, "recent");
	const [thenBy, setThenBy] = usePersistentString(THEN_BY_KEY, isThenBy, "none");
	const [reversedFlag, setReversedFlag] = usePersistentString(SORT_REVERSED_KEY, isFlag, "0");
	const [thenReversedFlag, setThenReversedFlag] = usePersistentString(
		THEN_REVERSED_KEY,
		isFlag,
		"0",
	);
	const sort: SortState = {
		sortBy,
		reversed: reversedFlag === "1",
		thenBy: thenBy === "none" ? null : thenBy,
		thenReversed: thenReversedFlag === "1",
	};
	const setSort = (patch: Partial<SortState>) => {
		if (patch.sortBy !== undefined) setSortBy(patch.sortBy);
		if (patch.reversed !== undefined) setReversedFlag(patch.reversed ? "1" : "0");
		if (patch.thenBy !== undefined) setThenBy(patch.thenBy ?? "none");
		if (patch.thenReversed !== undefined) setThenReversedFlag(patch.thenReversed ? "1" : "0");
	};

	const [deviceGroupBy, setDeviceGroupBy] = usePersistentString(GROUP_BY_KEY, isGroupBy, "none");
	const [columnsRaw, setColumnsRaw] = usePersistentString(
		COLUMNS_KEY,
		isAnyString,
		serializeColumns(DEFAULT_COLUMNS),
	);
	const deviceLayout = useMemo<LibraryLayout>(
		() => ({ groupBy: deviceGroupBy, columns: parseColumns(columnsRaw) }),
		[deviceGroupBy, columnsRaw],
	);

	// A save shows at once, and a second change before the shelf query refetches
	// builds on the first instead of on the stale stored view.
	const [pending, setPending] = useState<{ id: string; view: string } | null>(null);
	const shelfId = shelf?.id;
	const storedView = shelf?.view ?? null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new stored view or shelf supersedes the pending one.
	useEffect(() => setPending(null), [shelfId, storedView]);
	const shelfView = shelf && pending?.id === shelf.id ? pending.view : storedView;

	const hasShelf = shelf !== null;
	const layout = useMemo(
		() => (hasShelf ? resolveLayout(shelfView, deviceLayout) : deviceLayout),
		[hasShelf, shelfView, deviceLayout],
	);

	const saveLayout = (patch: Partial<LibraryLayout>) => {
		if (!shelf) return false;
		const view = writeShelfView(shelfView, layout, patch);
		setPending({ id: shelf.id, view });
		shelf.save(view);
		return true;
	};
	const setGroupBy = (groupBy: GroupBy) => {
		if (!saveLayout({ groupBy })) setDeviceGroupBy(groupBy);
	};
	const updateColumns = (update: (ids: readonly ColumnId[]) => ColumnId[]) => {
		if (!saveLayout({ columns: update(layout.columns) })) {
			setColumnsRaw((raw) => serializeColumns(update(parseColumns(raw))));
		}
	};

	const tableColumns = useMemo(() => columnsOf(layout.columns), [layout.columns]);

	return {
		sort,
		setSort,
		groupBy: layout.groupBy,
		setGroupBy,
		columnIds: layout.columns,
		tableColumns,
		toggleColumn: (id: ColumnId) => updateColumns((ids) => toggleColumn(ids, id)),
		moveColumn: (id: ColumnId, before: number) =>
			updateColumns((ids) => moveColumn(ids, id, before)),
	};
}
