import { cn } from "@lesefluss/ui/utils";
import type React from "react";

/** The caption under a figure: sentence case, never uppercase-tracked. */
export const STAT_CAPTION = "text-muted-foreground text-xs";

const VALUE_SIZE = {
	xl: "text-4xl leading-none tracking-tight",
	lg: "text-xl leading-none tracking-tight",
	md: "text-lg",
	sm: "text-base",
} as const;

/** A figure and its caption, 4 apart. */
export function StatTile({
	value,
	label,
	size = "md",
	align = "start",
	className,
	valueClassName,
}: {
	value: React.ReactNode;
	label: React.ReactNode;
	size?: keyof typeof VALUE_SIZE;
	align?: "start" | "end";
	className?: string;
	valueClassName?: string;
}) {
	return (
		<div className={cn("min-w-0", align === "end" && "text-right", className)}>
			<div className={cn("truncate font-semibold tabular-nums", VALUE_SIZE[size], valueClassName)}>
				{value}
			</div>
			<div className={cn("mt-1", STAT_CAPTION)}>{label}</div>
		</div>
	);
}
