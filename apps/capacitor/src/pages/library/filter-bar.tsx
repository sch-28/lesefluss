import { Button } from "@lesefluss/ui/button";
import { CHIP_BASE, CHIP_SELECTED, FilterChip } from "@lesefluss/ui/filter-chip";
import { cn } from "@lesefluss/ui/utils";
import { SlidersHorizontal, X } from "lucide-react";
import type React from "react";
import { PageContainer } from "../../components/page-container";
import {
	type FilterChip as ActiveChip,
	activeFilterCount,
	chipsOf,
	FACET_LABELS,
	type LibraryFilter,
	removeValue,
	setWordRange,
	type WordRange,
	wordRangeLabel,
} from "./filter-model";
import { type FacetOptions, optionLabel } from "./filter-picker";

type Props = {
	filter: LibraryFilter;
	onChange: (filter: LibraryFilter) => void;
	options: FacetOptions;
	/** Shown when the current filter can be saved as a smart shelf. */
	onSaveShelf?: () => void;
	/** The open user shelf: one that is not chips shows as one chip, and either opens the editor. */
	shelfConditions?: { isCustom: boolean; onEdit: () => void };
	/** The open shelf's own rule: its chips have no remove control, and Clear keeps it. */
	shelfRule?: LibraryFilter;
};

function isInRule(rule: LibraryFilter | undefined, { facet, value, isExcluded }: ActiveChip) {
	const selection = rule?.[facet];
	return !!selection && (isExcluded ? selection.out : selection.in).includes(value);
}

const sameWordRange = (a: WordRange | undefined, b: WordRange | undefined) =>
	!!a && !!b && a.min === b.min && a.max === b.max;

const Chip: React.FC<{
	name: string;
	label: string;
	isExcluded?: boolean;
	/** Absent for a chip of the shelf's own rule. */
	onRemove?: () => void;
}> = ({ name, label, isExcluded = false, onRemove }) => {
	const content = (
		<>
			<span className={isExcluded ? "text-destructive" : "text-muted-foreground"}>{name}</span>
			<span className={cn("max-w-40 truncate", isExcluded && "line-through")}>{label}</span>
		</>
	);
	const edge = cn("gap-1 border", isExcluded ? "border-destructive/50" : "border-transparent");
	if (!onRemove) {
		return (
			<span
				data-excluded={isExcluded || undefined}
				className={cn(CHIP_BASE, CHIP_SELECTED, edge, "pointer-events-none")}
			>
				{content}
			</span>
		);
	}
	return (
		<FilterChip
			selected
			action
			data-excluded={isExcluded || undefined}
			aria-label={`Remove filter ${name} ${label}`}
			onClick={onRemove}
			className={cn(edge, "pr-3")}
		>
			{content}
			<X className="text-muted-foreground" />
		</FilterChip>
	);
};

/** The active filter as chips, removable unless they are the shelf's own rule, an excluded value marked with − and a red edge. */
const FilterBar: React.FC<Props> = ({
	filter,
	onChange,
	options,
	onSaveShelf,
	shelfConditions,
	shelfRule,
}) => {
	const chips = chipsOf(filter);
	const count = activeFilterCount(filter);
	const isRuleWords = sameWordRange(shelfRule?.words, filter.words);
	const hasExtras =
		chips.some((chip) => !isInRule(shelfRule, chip)) || (!!filter.words && !isRuleWords);
	// A rule value dropped in the filter sheet has no chip left; Clear brings it back.
	const isMissingRule =
		!!shelfRule &&
		(chipsOf(shelfRule).some((chip) => !isInRule(filter, chip)) ||
			(!!shelfRule.words && !isRuleWords));
	if (count === 0 && !shelfConditions && !isMissingRule) return null;
	const matchesAllTags = filter.tags?.mode === "all";
	return (
		<PageContainer
			width="grid"
			className="flex items-center gap-2 overflow-x-auto px-4 py-1"
			data-testid="filter-bar"
		>
			{shelfConditions?.isCustom && (
				<FilterChip
					selected={false}
					action
					onClick={shelfConditions.onEdit}
					aria-label="Edit custom conditions"
					className="border border-primary/70 border-dashed bg-transparent"
				>
					<SlidersHorizontal className="text-primary" />
					Custom conditions
					<span className="text-primary">· Edit</span>
				</FilterChip>
			)}
			{chips.map((chip) => {
				const { facet, value, isExcluded } = chip;
				const all = facet === "tags" && matchesAllTags && !isExcluded ? " (all)" : "";
				const name = `${isExcluded ? "− " : ""}${FACET_LABELS[facet]}${all}:`;
				return (
					<Chip
						key={`${facet}:${value}`}
						name={name}
						label={optionLabel(options, facet, value)}
						isExcluded={isExcluded}
						onRemove={
							isInRule(shelfRule, chip)
								? undefined
								: () => onChange(removeValue(filter, facet, value))
						}
					/>
				);
			})}
			{filter.words && (
				<Chip
					name="Length:"
					label={`${wordRangeLabel(filter.words)} words`}
					onRemove={isRuleWords ? undefined : () => onChange(setWordRange(filter, null))}
				/>
			)}
			{(hasExtras || isMissingRule) && (
				<Button variant="link" size="sm" onClick={() => onChange(shelfRule ?? {})}>
					Clear
				</Button>
			)}
			{(onSaveShelf || (shelfConditions && !shelfConditions.isCustom)) && (
				<span className="ml-auto flex shrink-0">
					{shelfConditions && !shelfConditions.isCustom && (
						<Button variant="link" size="sm" onClick={shelfConditions.onEdit}>
							Edit conditions
						</Button>
					)}
					{onSaveShelf && (
						<Button variant="link" size="sm" onClick={onSaveShelf}>
							Save as smart shelf
						</Button>
					)}
				</span>
			)}
		</PageContainer>
	);
};

export default FilterBar;
