import { cn } from "@lesefluss/ui/utils";
import type React from "react";

/** The page widths (LESE-211): one-column flows (onboarding, speed test), text pages
 *  and book grids. In px, so a large app font size makes lines shorter instead of
 *  the page wider. */
export const PAGE_WIDTH_PX = { flow: 448, text: 768, grid: 1280 } as const;

export type PageWidth = keyof typeof PAGE_WIDTH_PX;

const WIDTH_CLASS: Record<PageWidth, string> = {
	flow: "max-w-[448px]",
	text: "max-w-[768px]",
	grid: "max-w-[1280px]",
};

type Props<T extends "div" | "ol" | "main"> = React.ComponentPropsWithRef<T> & {
	width: PageWidth;
	as?: T;
};

/** The one source of a page's max width, centred in the space beside the sidebar. */
export function PageContainer<T extends "div" | "ol" | "main" = "div">({
	width,
	as,
	className,
	...rest
}: Props<T>) {
	const Tag = (as ?? "div") as React.ElementType;
	return <Tag className={cn("mx-auto w-full", WIDTH_CLASS[width], className)} {...rest} />;
}
