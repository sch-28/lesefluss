import type * as React from "react";

import { cn } from "../lib/utils";

/** Shared by DrawerHeader and SheetHeader: left-aligned, on the 16px page gutter. */
export const SHEET_HEADER_CLASS = "flex flex-col gap-0.5 px-4 pt-2 pb-3 text-left";
export const SHEET_TITLE_CLASS = "font-semibold text-[18px] text-foreground leading-tight";
export const SHEET_SUBTITLE_CLASS = "text-[13px] text-muted-foreground";

/**
 * A sheet header with a trailing action: title (and subtitle) left, the
 * action right. Pass DrawerTitle/SheetTitle as `title` so the dialog keeps its name.
 */
export function SheetHeaderBar({
	title,
	subtitle,
	action,
	className,
}: {
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	action?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			data-slot="sheet-header-bar"
			className={cn("flex items-center gap-2 pt-2 pr-1 pb-3 pl-4", className)}
		>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				{title}
				{subtitle}
			</div>
			{action}
		</div>
	);
}

/** The sheet's text action ("Done", "Save"): primary, 44px tall, muted when disabled. */
export function SheetDoneButton({
	children = "Done",
	className,
	...props
}: Omit<React.ComponentProps<"button">, "type">) {
	return (
		<button
			type="button"
			className={cn(
				"inline-flex h-11 shrink-0 items-center rounded-full px-3 font-semibold text-primary text-sm outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:text-muted-foreground",
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}
