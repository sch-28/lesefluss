import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "../lib/utils";

const TOUCH_44 =
	"pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:content-['']";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-clip-padding font-medium text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
				outline:
					"border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				ghost:
					"hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
				destructive:
					"bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
				link: "text-primary underline-offset-4 hover:underline",
			},
			// Two text sizes and one radius: callers pick a size, never a height or radius of their own.
			// Icon sizes stretch their touch target to 44px with a ::before, keeping the look.
			size: {
				// On touch an ::after stretches the target to 44px tall (inset from inside the border, as below); ::before stays free for a caller's own hit area.
				default: `h-10 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 ${TOUCH_44} pointer-coarse:after:-inset-y-[3px]`,
				sm: `h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5 ${TOUCH_44} pointer-coarse:after:-inset-y-[7px]`,
				// The ::before insets from the padding box, inside the 1px border: each inset is 1px more than half the gap to 44px.
				icon: "relative size-8 before:absolute before:-inset-[7px] before:content-['']",
				"icon-xs":
					"relative size-6 before:absolute before:-inset-[11px] before:content-[''] [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "relative size-7 before:absolute before:-inset-[9px] before:content-['']",
				"icon-lg": "relative size-9 before:absolute before:-inset-[5px] before:content-['']",
			},
			// For a label that may outgrow the width at a large system text size: the height becomes a minimum.
			wrapLabel: {
				true: "h-auto whitespace-normal",
			},
		},
		compoundVariants: [
			{ wrapLabel: true, size: "default", className: "min-h-10 py-2" },
			{ wrapLabel: true, size: "sm", className: "min-h-8 py-1" },
		],
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	wrapLabel,
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, wrapLabel, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
