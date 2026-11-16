import { SHELF_VIEW_MAX } from "@lesefluss/core";
import { type GroupBy, isGroupBy } from "./group-by";
import { type ColumnId, parseColumns, serializeColumns } from "./table-columns";

/** What a collection or smart shelf stores in `view`; a newer device may add keys and ids. */
type StoredShelfView = { v: 1; groupBy?: string; columns?: string[]; [key: string]: unknown };

export type LibraryLayout = { groupBy: GroupBy; columns: ColumnId[] };

export function parseShelfView(raw: string | null): StoredShelfView | null {
	if (raw === null) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
		const view = parsed as Record<string, unknown>;
		const columns = Array.isArray(view.columns)
			? view.columns.filter((id): id is string => typeof id === "string")
			: undefined;
		const groupBy = typeof view.groupBy === "string" ? view.groupBy : undefined;
		return { ...view, v: 1, groupBy, columns };
	} catch {
		return null;
	}
}

/** The shelf's own group-by and columns where it has them, else the device's. */
export function resolveLayout(raw: string | null, device: LibraryLayout): LibraryLayout {
	const view = parseShelfView(raw);
	if (!view) return device;
	return {
		groupBy: view.groupBy !== undefined && isGroupBy(view.groupBy) ? view.groupBy : device.groupBy,
		columns: view.columns
			? parseColumns(serializeColumns(view.columns as ColumnId[]))
			: device.columns,
	};
}

/**
 * The shelf's `view` after one change. A shelf without one first takes the layout it
 * shows now, so it opens the same on a device whose own layout differs. Column ids
 * and keys this version does not know stay, after the ids it does.
 */
export function writeShelfView(
	raw: string | null,
	current: LibraryLayout,
	patch: Partial<LibraryLayout>,
): string {
	const stored = parseShelfView(raw);
	const base: StoredShelfView = stored ?? {
		v: 1,
		groupBy: current.groupBy,
		columns: [...current.columns],
	};
	const next: StoredShelfView = { ...base };
	if (patch.groupBy !== undefined) next.groupBy = patch.groupBy;
	if (patch.columns !== undefined) {
		const known = new Set<string>(
			parseColumns(serializeColumns((base.columns ?? []) as ColumnId[])),
		);
		const unknown = (base.columns ?? []).filter(
			(id) => !known.has(id) && !patch.columns?.includes(id as ColumnId),
		);
		next.columns = [...patch.columns, ...unknown];
		const json = JSON.stringify(next);
		if (json.length > SHELF_VIEW_MAX) return JSON.stringify({ ...next, columns: patch.columns });
		return json;
	}
	return JSON.stringify(next);
}
