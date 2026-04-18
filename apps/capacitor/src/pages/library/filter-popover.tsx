import type React from "react";
import SelectionPopover from "../../components/selection-popover";
import { FILTER_LABELS, FILTER_OPTIONS, type FilterBy } from "./sort-filter";

type Props = {
	trigger: string;
	filterBy: FilterBy;
	onFilter: (f: FilterBy) => void;
};

const FilterPopover: React.FC<Props> = ({ trigger, filterBy, onFilter }) => (
	<SelectionPopover
		trigger={trigger}
		options={FILTER_OPTIONS}
		labels={FILTER_LABELS}
		selected={filterBy}
		onSelect={onFilter}
	/>
);

export default FilterPopover;
