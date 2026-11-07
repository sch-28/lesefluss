import type React from "react";
import SelectionPopover, { type PopoverSection } from "../../components/selection-popover";
import { GROUP_LABELS, GROUP_OPTIONS, type GroupBy } from "./group-by";
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
	groupBy: GroupBy;
	onGroupBy: (g: GroupBy) => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** Set when G opened the menu, to land on the group-by rows. */
	focusGroupBy?: boolean;
};

export const GROUP_BY_HEADING = "Group by";

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
	groupBy,
	onGroupBy,
	open,
	onOpenChange,
	focusGroupBy = false,
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
		{
			heading: GROUP_BY_HEADING,
			options: GROUP_OPTIONS,
			labels: GROUP_LABELS,
			selected: groupBy,
			onSelect: (v) => onGroupBy(v as GroupBy),
		},
	];
	return (
		<SelectionPopover
			trigger={trigger}
			sections={sections}
			open={open}
			onOpenChange={onOpenChange}
			focusSection={focusGroupBy ? GROUP_BY_HEADING : undefined}
		/>
	);
};

export default SortPopover;
