import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../lib/utils";

/** A 44px round icon button. The label is required: it is the button's only name. */
export function IconButton({
	"aria-label": ariaLabel,
	asChild = false,
	className,
	...props
}: React.ComponentProps<"button"> & { "aria-label": string; asChild?: boolean }) {
	const Comp = asChild ? Slot.Root : "button";
	return (
		<Comp
			{...(asChild ? {} : { type: "button" as const })}
			aria-label={ariaLabel}
			data-slot="icon-button"
			className={cn(
				"inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-5 [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}
