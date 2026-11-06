import { Button } from "@lesefluss/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@lesefluss/ui/drawer";
import { Input } from "@lesefluss/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { cn } from "@lesefluss/ui/utils";
import { Check, ChevronDown, ChevronRight, Minus } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import {
	chipsOf,
	cycleValue,
	FACET_LABELS,
	FACETS,
	type Facet,
	FIXED_FACET_VALUES,
	type LibraryFilter,
	valueState,
} from "./filter-model";
import type { LibraryItem } from "./sort-filter";

export type FacetOption = { value: string; label: string; count: number };
export type FacetOptions = Record<Facet, FacetOption[]>;

const SEARCHABLE_FROM = 8;

/** Every value each facet can offer, with how many rows carry it. */
export function facetOptions(items: readonly LibraryItem[]): FacetOptions {
	const counts = Object.fromEntries(FACETS.map((f) => [f, new Map<string, number>()])) as Record<
		Facet,
		Map<string, number>
	>;
	const seriesTitles = new Map<string, string>();
	for (const item of items) {
		if (item.kind === "series") seriesTitles.set(item.series.id, item.series.title);
		for (const facet of FACETS) {
			for (const value of item.facets[facet]) {
				counts[facet].set(value, (counts[facet].get(value) ?? 0) + 1);
			}
		}
	}
	const options = {} as FacetOptions;
	for (const facet of FACETS) {
		const fixed = FIXED_FACET_VALUES[facet];
		if (fixed) {
			options[facet] = fixed.map((v) => ({ ...v, count: counts[facet].get(v.value) ?? 0 }));
			continue;
		}
		options[facet] = [...counts[facet]]
			.map(([value, count]) => ({
				value,
				label: facet === "series" ? (seriesTitles.get(value) ?? value) : value,
				count,
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}
	return options;
}

export function optionLabel(options: FacetOptions, facet: Facet, value: string): string {
	return options[facet].find((o) => o.value === value)?.label ?? value;
}

type PanelProps = {
	filter: LibraryFilter;
	onChange: (filter: LibraryFilter) => void;
	options: FacetOptions;
};

const StateBox: React.FC<{ state: ReturnType<typeof valueState> }> = ({ state }) => (
	<span
		aria-hidden
		className={cn(
			"inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border",
			state === "in" && "border-primary bg-primary text-primary-foreground",
			state === "out" && "border-destructive bg-destructive/15 text-destructive",
		)}
	>
		{state === "in" && <Check className="size-3.5" />}
		{state === "out" && <Minus className="size-3.5" />}
	</span>
);

const STATE_NAMES = { off: "off", in: "included", out: "excluded" } as const;

const FacetSection: React.FC<PanelProps & { facet: Facet }> = ({
	facet,
	filter,
	onChange,
	options,
}) => {
	const selection = filter[facet];
	const [isOpen, setIsOpen] = useState(() => !!selection || facet === "status");
	const [query, setQuery] = useState("");
	const all = options[facet];
	if (all.length === 0) return null;
	const needle = query.trim().toLowerCase();
	const shown = needle ? all.filter((o) => o.label.toLowerCase().includes(needle)) : all;
	const summary = selection
		? [
				selection.in.length ? `✓${selection.in.length}` : "",
				selection.out.length ? `−${selection.out.length}` : "",
			]
				.filter(Boolean)
				.join(" ")
		: "Any";
	const sectionId = `filter-facet-${facet}`;

	return (
		<section className="border-border border-b last:border-b-0">
			<h3 className="m-0">
				<button
					type="button"
					aria-expanded={isOpen}
					aria-controls={sectionId}
					onClick={() => setIsOpen((o) => !o)}
					className="flex w-full items-center gap-2 py-2.5 text-left font-medium text-sm"
				>
					{isOpen ? (
						<ChevronDown className="size-3.5 text-muted-foreground" />
					) : (
						<ChevronRight className="size-3.5 text-muted-foreground" />
					)}
					{FACET_LABELS[facet]}
					<span
						className={cn(
							"ml-auto font-normal text-xs",
							selection ? "text-primary" : "text-muted-foreground",
						)}
					>
						{summary}
					</span>
				</button>
			</h3>
			{isOpen && (
				<div id={sectionId} className="pb-2">
					{all.length >= SEARCHABLE_FROM && (
						<Input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder={`Find ${FACET_LABELS[facet].toLowerCase()}…`}
							aria-label={`Find ${FACET_LABELS[facet].toLowerCase()}`}
							className="mb-1 h-8"
						/>
					)}
					<ul className="m-0 flex list-none flex-col p-0">
						{shown.map((option) => {
							const state = valueState(filter, facet, option.value);
							return (
								<li key={option.value}>
									<button
										type="button"
										aria-label={`${FACET_LABELS[facet]} ${option.label}, ${STATE_NAMES[state]}`}
										data-state={state}
										onClick={() => onChange(cycleValue(filter, facet, option.value))}
										className="flex w-full items-center gap-3 rounded-md px-1 py-1.5 text-left text-sm hover:bg-muted"
									>
										<StateBox state={state} />
										<span
											className={cn(
												"min-w-0 flex-1 truncate",
												state === "out" && "text-muted-foreground line-through",
											)}
										>
											{option.label}
										</span>
										<span className="text-muted-foreground text-xs tabular-nums">
											{option.count}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				</div>
			)}
		</section>
	);
};

const FilterPanel: React.FC<PanelProps> = (props) => (
	<div className="flex flex-col">
		<p className="m-0 pb-1 text-muted-foreground text-xs">
			Tap a value to include it, again to exclude it, again to clear it.
		</p>
		{FACETS.map((facet) => (
			<FacetSection key={facet} facet={facet} {...props} />
		))}
	</div>
);

type PickerProps = PanelProps & {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Rows the current filter leaves, for the phone sheet's Show button. */
	resultCount: number;
};

/** Desktop: a popover under the Add filter button. */
export const FilterPopover: React.FC<PickerProps & { trigger: React.ReactNode }> = ({
	open,
	onOpenChange,
	trigger,
	resultCount: _,
	...panel
}) => (
	<Popover open={open} onOpenChange={onOpenChange}>
		<PopoverTrigger asChild>{trigger}</PopoverTrigger>
		<PopoverContent
			align="start"
			className="max-h-[70vh] w-80 overflow-y-auto px-3 py-2"
			data-testid="filter-picker"
		>
			<FilterPanel {...panel} />
		</PopoverContent>
	</Popover>
);

/** Phone: the same facets in a bottom sheet. */
export const FilterSheet: React.FC<PickerProps> = ({
	open,
	onOpenChange,
	resultCount,
	...panel
}) => {
	const activeCount = useMemo(() => chipsOf(panel.filter).length, [panel.filter]);
	return (
		<Drawer open={open} onOpenChange={onOpenChange}>
			<DrawerContent data-testid="filter-picker">
				<DrawerHeader className="flex-row items-baseline justify-between text-left">
					<DrawerTitle>Filter</DrawerTitle>
					<DrawerDescription>
						{activeCount > 0 ? `${activeCount} active` : "None"}
					</DrawerDescription>
				</DrawerHeader>
				<div className="overflow-y-auto px-5">
					<FilterPanel {...panel} />
				</div>
				<DrawerFooter className="flex-row border-border border-t">
					<Button
						variant="outline"
						className="flex-1"
						disabled={activeCount === 0}
						onClick={() => panel.onChange({})}
					>
						Clear
					</Button>
					<Button className="flex-[1.8]" onClick={() => onOpenChange(false)}>
						Show {resultCount} {resultCount === 1 ? "book" : "books"}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
};
