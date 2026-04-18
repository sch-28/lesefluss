import type React from "react";
import SelectionPopover from "../../components/selection-popover";
import { SORT_LABELS, SORT_OPTIONS, type SortBy } from "./sort-filter";

type Props = {
	trigger: string;
	sortBy: SortBy;
	onSort: (s: SortBy) => void;
};

const SortPopover: React.FC<Props> = ({ trigger, sortBy, onSort }) => (
	<SelectionPopover
		trigger={trigger}
		options={SORT_OPTIONS}
		labels={SORT_LABELS}
		selected={sortBy}
		onSelect={onSort}
	/>
);

export default SortPopover;
