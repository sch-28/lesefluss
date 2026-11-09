import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "../lib/utils";

export const SELECTED_TINT = "bg-[color-mix(in_oklab,var(--primary)_15%,transparent)] text-primary";

export type SegmentedOption<T extends string> = {
	value: T;
	label: React.ReactNode;
	/** Needed when `label` is not plain text. */
	ariaLabel?: string;
};

/**
 * The one "pick one of a few" control. Items are 38px inside a 3px track, so
 * the row is a 44px touch target. A tap on the selected item keeps it selected.
 */
export function SegmentedControl<T extends string>({
	value,
	onValueChange,
	options,
	className,
	itemClassName,
	disabled = false,
	"aria-label": ariaLabel,
	...rest
}: {
	value: T;
	onValueChange: (value: T) => void;
	options: readonly SegmentedOption<T>[];
	"aria-label": string;
	className?: string;
	itemClassName?: string;
	disabled?: boolean;
	"data-testid"?: string;
}) {
	return (
		<ToggleGroupPrimitive.Root
			type="single"
			value={value}
			onValueChange={(next) => {
				const option = options.find((o) => o.value === next);
				if (option) onValueChange(option.value);
			}}
			aria-label={ariaLabel}
			disabled={disabled}
			data-slot="segmented-control"
			className={cn("flex w-full items-stretch gap-0.5 rounded-[10px] bg-muted p-[3px]", className)}
			{...rest}
		>
			{options.map((o) => (
				<ToggleGroupPrimitive.Item
					key={o.value}
					value={o.value}
					aria-label={o.ariaLabel}
					className={cn(
						"inline-flex min-h-[38px] min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[8px] px-3 font-medium text-muted-foreground text-sm outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
						o.value === value && `${SELECTED_TINT} hover:text-primary`,
						itemClassName,
					)}
				>
					{o.label}
				</ToggleGroupPrimitive.Item>
			))}
		</ToggleGroupPrimitive.Root>
	);
}
