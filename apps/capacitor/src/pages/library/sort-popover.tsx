import type React from "react";
import SelectionPopover, { type PopoverSection } from "../../components/selection-popover";
import { NATURAL_DIR, SORT_LABELS, SORT_OPTIONS, type SortBy, type SortDir } from "./sort-filter";

export type ThenBy = SortBy | "none";
/** A series' own #N order, offered only where `hasSeriesOrder` is set. */
export const SERIES_ORDER = "seriesOrder";
export type PopoverSortBy = SortBy | typeof SERIES_ORDER;

type Props = {
	trigger: React.ReactNode;
	sortBy: PopoverSortBy;
	onSort: (s: PopoverSortBy) => void;
	reversed: boolean;
	onReversed: (reversed: boolean) => void;
	thenBy: ThenBy;
	onThenBy: (s: ThenBy) => void;
	hasSeriesOrder?: boolean;
};

const THEN_LABELS: Record<ThenBy, string> = { none: "None", ...SORT_LABELS };
const SORT_BY_LABELS: Record<PopoverSortBy, string> = {
	[SERIES_ORDER]: "Series order",
	...SORT_LABELS,
};
const DIR_OPTIONS: SortDir[] = ["asc", "desc"];
const DIR_LABELS: Record<SortDir, string> = { asc: "Ascending", desc: "Descending" };

const SortPopover: React.FC<Props> = ({
	trigger,
	sortBy,
	onSort,
	reversed,
	onReversed,
	thenBy,
	onThenBy,
	hasSeriesOrder = false,
}) => {
	const naturalDir: SortDir = sortBy === SERIES_ORDER ? "asc" : NATURAL_DIR[sortBy];
	// Order first: two options above the long field list, so it never sits below the fold.
	const sections: PopoverSection<string>[] = [
		{
			heading: "Order",
			options: DIR_OPTIONS,
			labels: DIR_LABELS,
			selected: reversed ? (naturalDir === "asc" ? "desc" : "asc") : naturalDir,
			onSelect: (v) => onReversed(v !== naturalDir),
		},
		{
			heading: "Sort by",
			options: hasSeriesOrder ? [SERIES_ORDER, ...SORT_OPTIONS] : SORT_OPTIONS,
			labels: SORT_BY_LABELS,
			selected: sortBy,
			onSelect: (v) => onSort(v as PopoverSortBy),
		},
	];
	// Series order has no ties to break.
	if (sortBy !== SERIES_ORDER)
		sections.push({
			heading: "Then by",
			options: ["none", ...SORT_OPTIONS.filter((s) => s !== sortBy)],
			labels: THEN_LABELS,
			selected: thenBy === sortBy ? "none" : thenBy,
			onSelect: (v) => onThenBy(v as ThenBy),
		});
	return <SelectionPopover trigger={trigger} sections={sections} />;
};

export default SortPopover;
