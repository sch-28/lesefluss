import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { PageContainer, type PageWidth } from "./page-container";

/** Header → content, 12px. PageToolbar's own bottom padding makes the last row → content 12 too. */
export const PAGE_TOP = "pt-3";
export const PAGE_TOP_PX = 12;
/** The phone's floating action button (or fixed action bar) needs the room; desktop has none. */
const PAGE_BOTTOM_FAB = "pb-24 md:pb-10";

/** Each PageToolbar row's own padding: with the toolbar's py-2 it makes 12 above the first row,
 *  8 between rows and 12 under the last, and it leaves a chip strip's 3px focus ring inside its
 *  `overflow-x` box. */
export const TOOLBAR_ROW = "py-1";

export const STICKY_BELOW_HEADER = "sticky top-[calc(var(--safe-top)+3rem+1px)] z-10";

type BodyProps = React.ComponentPropsWithRef<"div"> & {
	width: PageWidth;
	as?: "div" | "main";
	/** The toolbar's padding already holds the gap to the content. */
	belowToolbar?: boolean;
	fab?: boolean;
	/** A bar fixed over the content at every width, such as the selection bar. */
	fixedBar?: boolean;
};

/** A page's content column: its gap under the header (or toolbar) and its one bottom padding.
 *  The first child's own top margin is dropped so that gap is the page's alone. */
export function PageBody({
	width,
	as,
	belowToolbar = false,
	fab = false,
	fixedBar = false,
	className,
	...rest
}: BodyProps) {
	return (
		<PageContainer
			as={as}
			width={width}
			className={cn(
				"px-4 [&>*:first-child]:mt-0",
				!belowToolbar && PAGE_TOP,
				fixedBar ? "pb-24" : fab ? PAGE_BOTTOM_FAB : "pb-10",
				className,
			)}
			{...rest}
		/>
	);
}

/** A full-width band of control rows (search, filters, chips, tabs) under the header; each row
 *  carries TOOLBAR_ROW and its own PageContainer. Renders nothing visible without rows. */
export function PageToolbar({
	sticky = false,
	className,
	...rest
}: React.ComponentPropsWithRef<"div"> & { sticky?: boolean }) {
	return (
		<div
			className={cn(
				"flex flex-col py-2 empty:hidden",
				sticky && [STICKY_BELOW_HEADER, "bg-background/95 backdrop-blur"],
				className,
			)}
			{...rest}
		/>
	);
}
