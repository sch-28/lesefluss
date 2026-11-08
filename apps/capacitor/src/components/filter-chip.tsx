import { Button } from "@lesefluss/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@lesefluss/ui/dropdown-menu";
import { cn } from "@lesefluss/ui/utils";
import { ChevronDown, X } from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";

type FilterChipProps<T extends string> = {
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
 * On touch, opens on click instead of Radix's pointerdown: a swipe across the
 * scrolling chip row would otherwise open a menu and kill the scroll. Mouse
 * keeps Radix's own handling, so the two never toggle the same press twice.
 */
export function FilterChip<T extends string>({
	label,
	isActive,
	value,
	options,
	onSelect,
	onClear,
	className,
}: FilterChipProps<T>) {
	const [isOpen, setOpen] = useState(false);
	const pointerTypeRef = useRef<string>("mouse");
	return (
		<div className={cn("flex shrink-0 items-center", className)}>
			<DropdownMenu open={isOpen} onOpenChange={setOpen}>
				<DropdownMenuTrigger asChild>
					<Button
						variant={isActive ? "default" : "outline"}
						size="sm"
						className={cn("min-w-0 gap-1", isActive && onClear && "rounded-r-none pr-2")}
						onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => {
							pointerTypeRef.current = e.pointerType;
							if (e.pointerType !== "mouse") e.preventDefault();
						}}
						onClick={() => {
							if (pointerTypeRef.current !== "mouse") setOpen((open) => !open);
						}}
					>
						<span className="min-w-0 truncate">{label}</span>
						<ChevronDown className="size-3.5" />
					</Button>
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
										{o.count.toLocaleString()}
									</span>
								)}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			{isActive && onClear && (
				<Button
					variant="default"
					size="sm"
					className="rounded-l-none border-primary-foreground/20 border-l px-2"
					onClick={onClear}
					aria-label={`Remove ${label} filter`}
				>
					<X className="size-3.5" />
				</Button>
			)}
		</div>
	);
}
