import { cn } from "@lesefluss/ui/utils";
import type React from "react";

/** The one section header: a title, an optional muted line under it, and an aside or action at its end. */
export function SectionHeader({
	title,
	subtitle,
	aside,
	className,
}: {
	title?: string;
	subtitle?: React.ReactNode;
	/** A muted count or a control, at the end of the row. */
	aside?: React.ReactNode;
	className?: string;
}) {
	return (
		<header className={cn("mb-3 flex items-end justify-between gap-3", className)}>
			<div className="flex min-w-0 flex-col gap-0.5">
				{title && <h2 className="m-0 font-semibold text-base text-foreground">{title}</h2>}
				{subtitle != null && <p className="m-0 text-muted-foreground text-sm">{subtitle}</p>}
			</div>
			{aside != null && (
				<div className="flex shrink-0 items-center text-muted-foreground text-sm tabular-nums">
					{aside}
				</div>
			)}
		</header>
	);
}
