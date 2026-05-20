import { Popover, PopoverContent, PopoverTrigger } from "@lesefluss/ui/popover";
import { Check } from "lucide-react";
import type React from "react";
import { useState } from "react";

type Props<T extends string> = {
	trigger: React.ReactNode;
	options: readonly T[];
	labels: Record<T, string>;
	selected: T;
	onSelect: (value: T) => void;
	minWidth?: number;
};

/**
 * Checkmark-style popover keyed by a string enum. Shared by Library's
 * Sort and Filter menus. Add more call sites here rather than cloning.
 */
function SelectionPopover<T extends string>({
	trigger,
	options,
	labels,
	selected,
	onSelect,
	minWidth = 160,
}: Props<T>): React.ReactElement {
	const [open, setOpen] = useState(false);
	const handleSelect = (option: T) => {
		setOpen(false);
		onSelect(option);
	};
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent align="end" className="w-auto p-1" style={{ minWidth }}>
				<div className="flex flex-col">
					{options.map((option) => (
						<button
							key={option}
							type="button"
							onClick={() => handleSelect(option)}
							className="flex h-9 items-center justify-between gap-3 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted"
						>
							<span>{labels[option]}</span>
							{selected === option && <Check className="size-4 shrink-0" />}
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export default SelectionPopover;
