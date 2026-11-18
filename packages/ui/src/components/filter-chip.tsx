import type * as React from "react";

import { formatCount } from "../lib/format-count";
import { cn } from "../lib/utils";
import { SELECTED_TINT } from "./segmented-control";

export const CHIP_BASE =
	"inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-muted px-4 font-medium text-foreground text-sm outline-none transition-colors hover:bg-muted/70 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

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
