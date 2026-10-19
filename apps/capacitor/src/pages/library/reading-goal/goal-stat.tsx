import { cn } from "@lesefluss/ui/utils";
import type React from "react";

export function GoalStat({
	value,
	label,
	className,
	size = "md",
}: {
	value: React.ReactNode;
	label: string;
	className?: string;
	size?: "md" | "sm";
}) {
	return (
		<div className="min-w-0">
			<div
				className={cn(
					"truncate font-semibold tabular-nums",
					size === "md" ? "text-[17px]" : "text-base",
					className,
				)}
			>
				{value}
			</div>
			<div className="mt-0.5 text-[10px] uppercase tracking-wider opacity-60">{label}</div>
		</div>
	);
}

/** "12 d" on screen, "12 days" to a screen reader. */
export function DayCount({ days }: { days: number }) {
	return (
		<>
			{days}
			<span aria-hidden="true"> d</span>
			<span className="sr-only"> {days === 1 ? "day" : "days"}</span>
		</>
	);
}
