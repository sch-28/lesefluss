import type React from "react";
import SelectionPopover, { type PopoverSection } from "../../components/selection-popover";
import {
	NATURAL_DIR,
	SORT_LABELS,
	SORT_OPTIONS,
	type SortBy,
	type SortDir,
	sortDirection,
} from "./sort-filter";

export type ThenBy = SortBy | "none";

type Props = {
	trigger: React.ReactNode;
	sortBy: SortBy;
	onSort: (s: SortBy) => void;
	reversed: boolean;
	onReversed: (reversed: boolean) => void;
	thenBy: ThenBy;
	onThenBy: (s: ThenBy) => void;
};

const THEN_LABELS: Record<ThenBy, string> = { none: "None", ...SORT_LABELS };
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
}) => {
	const sections: PopoverSection<string>[] = [
		{
			heading: "Sort by",
			options: SORT_OPTIONS,
			labels: SORT_LABELS,
			selected: sortBy,
			onSelect: (v) => onSort(v as SortBy),
		},
		{
			heading: "Order",
			options: DIR_OPTIONS,
			labels: DIR_LABELS,
			selected: sortDirection(sortBy, reversed),
			onSelect: (v) => onReversed(v !== NATURAL_DIR[sortBy]),
		},
		{
			heading: "Then by",
			options: ["none", ...SORT_OPTIONS.filter((s) => s !== sortBy)],
			labels: THEN_LABELS,
			selected: thenBy === sortBy ? "none" : thenBy,
			onSelect: (v) => onThenBy(v as ThenBy),
		},
	];
	return <SelectionPopover trigger={trigger} sections={sections} />;
};

export default SortPopover;
