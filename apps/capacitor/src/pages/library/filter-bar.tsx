import { cn } from "@lesefluss/ui/utils";
import { Plus, X } from "lucide-react";
import type React from "react";
import { chipsOf, FACET_LABELS, type LibraryFilter, removeValue } from "./filter-model";
import { type FacetOptions, optionLabel } from "./filter-picker";

type Props = {
	filter: LibraryFilter;
	onChange: (filter: LibraryFilter) => void;
	options: FacetOptions;
	/** The desktop Add filter trigger; the phone opens its sheet from the header. */
	addFilter?: React.ReactNode;
};

/** The active filter as removable chips, an excluded value marked with − and a red edge. */
const FilterBar: React.FC<Props> = ({ filter, onChange, options, addFilter }) => {
	const chips = chipsOf(filter);
	if (chips.length === 0 && !addFilter) return null;
	return (
		<div
			className="flex items-center gap-1.5 overflow-x-auto px-4 py-2 content-container"
			data-testid="filter-bar"
		>
			{chips.map(({ facet, value, isExcluded }) => {
				const label = optionLabel(options, facet, value);
				const name = `${isExcluded ? "− " : ""}${FACET_LABELS[facet]}:`;
				return (
					<span
						key={`${facet}:${value}`}
						data-excluded={isExcluded || undefined}
						className={cn(
							"inline-flex h-7 shrink-0 items-center gap-1 rounded-full border bg-muted py-0 pr-1 pl-2.5 text-xs",
							isExcluded ? "border-destructive/50" : "border-transparent",
						)}
					>
						<span className={isExcluded ? "text-destructive" : "text-muted-foreground"}>
							{name}
						</span>
						<span className={cn("max-w-40 truncate", isExcluded && "line-through")}>{label}</span>
						<button
							type="button"
							aria-label={`Remove filter ${name} ${label}`}
							onClick={() => onChange(removeValue(filter, facet, value))}
							className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
						>
							<X className="size-3" />
						</button>
					</span>
				);
			})}
			{addFilter}
			{chips.length > 0 && (
				<button
					type="button"
					onClick={() => onChange({})}
					className="shrink-0 px-1 text-primary text-xs hover:underline"
				>
					Clear
				</button>
			)}
		</div>
	);
};

export const AddFilterButton = ({
	ref,
	...props
}: React.ComponentProps<"button">): React.ReactElement => (
	<button
		ref={ref}
		type="button"
		className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border border-dashed px-2.5 text-muted-foreground text-xs hover:text-foreground"
		{...props}
	>
		<Plus className="size-3" />
		Add filter
	</button>
);

export default FilterBar;
