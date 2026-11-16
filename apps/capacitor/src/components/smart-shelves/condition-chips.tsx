import type React from "react";
import {
	chipsOf,
	FACET_LABELS,
	type LibraryFilter,
	wordRangeLabel,
} from "../../pages/library/filter-model";
import { type FacetOptions, optionLabel } from "../../pages/library/filter-picker";

/** A filter's conditions as read-only chips. */
export const ConditionChips: React.FC<{ filter: LibraryFilter; options: FacetOptions }> = ({
	filter,
	options,
}) => {
	const matchesAllTags = filter.tags?.mode === "all";
	return (
		<ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Conditions">
			{chipsOf(filter).map(({ facet, value, isExcluded }) => {
				const all = facet === "tags" && matchesAllTags && !isExcluded ? " (all)" : "";
				return (
					<li
						key={`${facet}:${value}:${isExcluded}`}
						className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-xs"
					>
						<span className={isExcluded ? "text-destructive" : "text-muted-foreground"}>
							{isExcluded ? "− " : ""}
							{FACET_LABELS[facet]}
							{all}:
						</span>
						<span className={isExcluded ? "line-through" : undefined}>
							{optionLabel(options, facet, value)}
						</span>
					</li>
				);
			})}
			{filter.words && (
				<li className="inline-flex h-7 items-center gap-1 rounded-full bg-muted px-2.5 text-xs">
					<span className="text-muted-foreground">Length:</span>
					<span>{wordRangeLabel(filter.words)} words</span>
				</li>
			)}
		</ul>
	);
};
