import type React from "react";
import SelectionPopover, { type PopoverSection } from "../../components/selection-popover";
import { FILTER_LABELS, FILTER_OPTIONS, type FilterBy } from "./sort-filter";

/** Sentinel for "no tag filter", so the tag group behaves like any other
 *  exclusive selection instead of needing a null-shaped option. */
const ANY_TAG = "\u0000any-tag";

type Props = {
	trigger: React.ReactNode;
	filterBy: FilterBy;
	onFilter: (f: FilterBy) => void;
	/** Tags actually in use; the group is hidden when there are none. */
	tags: readonly string[];
	tag: string | null;
	onTag: (tag: string | null) => void;
};

/** Two independent axes in one menu: the shelf a book sits on, and a tag it carries. */
const FilterPopover: React.FC<Props> = ({ trigger, filterBy, onFilter, tags, tag, onTag }) => {
	const sections: PopoverSection<string>[] = [
		{
			options: FILTER_OPTIONS,
			labels: FILTER_LABELS,
			selected: filterBy,
			onSelect: (value) => onFilter(value as FilterBy),
		},
	];

	if (tags.length > 0) {
		const options = [ANY_TAG, ...tags];
		sections.push({
			heading: "Tags",
			options,
			labels: Object.fromEntries(options.map((t) => [t, t === ANY_TAG ? "Any tag" : t])),
			selected: tag ?? ANY_TAG,
			onSelect: (value) => onTag(value === ANY_TAG ? null : value),
		});
	}

	return <SelectionPopover trigger={trigger} sections={sections} />;
};

export default FilterPopover;
