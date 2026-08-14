import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { Check } from "lucide-react";
import type React from "react";
import { useState } from "react";

export type PopoverSection<T extends string> = {
	/** Rendered above the group; omit for the first, unlabelled one. */
	heading?: string;
	options: readonly T[];
	labels: Record<T, string>;
	selected: T | null;
	onSelect: (value: T) => void;
};

type Props<T extends string> = {
	trigger: React.ReactNode;
	sections: readonly PopoverSection<T>[];
	minWidth?: number;
};

function Row({
	label,
	isSelected,
	onSelect,
}: {
	label: string;
	isSelected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className="flex h-9 items-center justify-between gap-3 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted"
		>
			<span className="truncate">{label}</span>
			{isSelected && <Check className="size-4 shrink-0" />}
		</button>
	);
}

/**
 * Checkmark-style popover keyed by a string enum. Shared by Library's Sort and
 * Filter menus. Add more call sites here rather than cloning.
 *
 * Sections exist because Filter carries two independent axes (shelf and tag)
 * while Sort carries one; each section owns its own selection.
 */
function SelectionPopover<T extends string>({
	trigger,
	sections,
	minWidth = 160,
}: Props<T>): React.ReactElement {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent
				align="end"
				className="max-h-[70vh] w-auto overflow-y-auto p-1"
				style={{ minWidth }}
			>
				<div className="flex flex-col">
					{sections.map((section, index) => (
						<div key={section.heading ?? index} className="flex flex-col">
							{section.heading && (
								<>
									{index > 0 && <div className="my-1 border-border border-t" />}
									<span className="px-2 py-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
										{section.heading}
									</span>
								</>
							)}
							{section.options.map((option) => (
								<Row
									key={option}
									label={section.labels[option]}
									isSelected={section.selected === option}
									onSelect={() => {
										setOpen(false);
										section.onSelect(option);
									}}
								/>
							))}
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export default SelectionPopover;
