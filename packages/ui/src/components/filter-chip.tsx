import { ChevronDown, X } from "lucide-react";
import type * as React from "react";
import { useRef, useState } from "react";
import { formatCount } from "../lib/format-count";
import { cn } from "../lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "./dropdown-menu";
import { SELECTED_TINT } from "./segmented-control";

export const CHIP_BASE =
	"inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full [&_svg:not([class*='size-'])]:size-4 bg-muted px-4 font-medium text-foreground text-sm outline-none transition-colors hover:bg-muted/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

export const CHIP_SELECTED = `${SELECTED_TINT} hover:bg-[color-mix(in_oklab,var(--primary)_22%,transparent)]`;

/**
 * The one chip: a 44px pill, tinted when selected. A 0 count is never shown.
 * `action` chips (remove a filter, add a tag) do something on tap instead of toggling, so they carry no pressed state.
 */
export function FilterChip({
	selected,
	count,
	action = false,
	className,
	children,
	...props
}: Omit<React.ComponentProps<"button">, "type"> & {
	selected: boolean;
	count?: number;
	action?: boolean;
}) {
	return (
		<button
			type="button"
			aria-pressed={action ? undefined : selected}
			data-slot="filter-chip"
			className={cn(CHIP_BASE, selected && CHIP_SELECTED, className)}
			{...props}
		>
			{children}
			{count !== undefined && count > 0 && (
				<span className="text-muted-foreground text-xs tabular-nums">{formatCount(count)}</span>
			)}
		</button>
	);
}

type FilterMenuChipProps<T extends string> = {
	label: string;
	isActive: boolean;
	value: T;
	options: readonly { value: T; label: string; count?: number }[];
	onSelect: (value: T) => void;
	onClear?: () => void;
	/** On the wrapper; `min-w-0 shrink` lets a long label truncate while × stays whole. */
	className?: string;
};

/**
 * A chip that opens a menu of options, with an optional × that clears it.
 * On touch, opens on click instead of Radix's pointerdown: a swipe across the
 * scrolling chip row would otherwise open a menu and kill the scroll. Mouse
 * keeps Radix's own handling, so the two never toggle the same press twice.
 */
export function FilterMenuChip<T extends string>({
	label,
	isActive,
	value,
	options,
	onSelect,
	onClear,
	className,
}: FilterMenuChipProps<T>) {
	const [isOpen, setOpen] = useState(false);
	const pointerTypeRef = useRef<string>("mouse");
	return (
		<div className={cn("flex shrink-0 items-center", className)}>
			<DropdownMenu open={isOpen} onOpenChange={setOpen}>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className={cn(
							CHIP_BASE,
							"min-w-0 gap-1",
							isActive && CHIP_SELECTED,
							isActive && onClear && "rounded-r-none pr-2",
						)}
						onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => {
							pointerTypeRef.current = e.pointerType;
							if (e.pointerType !== "mouse") e.preventDefault();
						}}
						onClick={() => {
							if (pointerTypeRef.current !== "mouse") setOpen((open) => !open);
						}}
					>
						<span className="min-w-0 truncate">{label}</span>
						<ChevronDown />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="max-h-80 min-w-48 overflow-y-auto">
					<DropdownMenuRadioGroup
						value={value}
						onValueChange={(v) => {
							const option = options.find((o) => o.value === v);
							if (option) onSelect(option.value);
						}}
					>
						{options.map((o) => (
							<DropdownMenuRadioItem key={o.value} value={o.value} className="gap-4">
								<span className="min-w-0 flex-1 truncate">{o.label}</span>
								{o.count !== undefined && (
									<span className="whitespace-nowrap text-muted-foreground text-xs tabular-nums">
										{formatCount(o.count)}
									</span>
								)}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			{isActive && onClear && (
				<button
					type="button"
					className={cn(CHIP_BASE, CHIP_SELECTED, "rounded-l-none border-primary/20 border-l px-3")}
					onClick={onClear}
					aria-label={`Remove ${label} filter`}
				>
					<X />
				</button>
			)}
		</div>
	);
}
