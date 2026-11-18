import type * as React from "react";

import { cn } from "../lib/utils";

/** The small count pill on a nav item or an icon button. The caller places it; counts above 99 read "99+". */
function CountBadge({
	count,
	className,
	...props
}: Omit<React.ComponentProps<"span">, "children"> & { count: number }) {
	return (
		<span
			data-slot="count-badge"
			className={cn(
				"flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-semibold text-2xs text-primary-foreground tabular-nums",
				className,
			)}
			{...props}
		>
			{count > 99 ? "99+" : count}
		</span>
	);
}

export { CountBadge };
