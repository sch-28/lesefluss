import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { SectionHeader } from "./section-header";

/** The card surface. A card-shaped element that cannot be a `Card` (a button, a link) takes this class. */
export const CARD = "rounded-xl border border-border bg-card p-4 text-card-foreground";

/** The title under a book cover, in every grid and shelf: two lines at most, never a reserved second line. */
export const CARD_TITLE =
	"line-clamp-2 overflow-hidden text-ellipsis font-medium text-sm leading-[1.25]";

/** A tile inside a card, or a quiet inset block. */
export const CARD_TILE = "rounded-lg bg-muted/40 p-3";

/** Cards stacked in a column sit 16 apart. */
export const CARD_STACK = "flex flex-col gap-4";

/** Inside a card, the title and every block sit 12 apart. */
export const CARD_BODY = "flex flex-col gap-3";

/**
 * The one card: its surface, then an optional `SectionHeader` and its blocks, all 12 apart.
 * A list card (rows to the edges) passes `flush` and insets its rows itself.
 */
export function Card({
	title,
	subtitle,
	aside,
	flush = false,
	className,
	children,
	...rest
}: {
	title?: React.ReactNode;
	subtitle?: React.ReactNode;
	aside?: React.ReactNode;
	flush?: boolean;
	className?: string;
	children?: React.ReactNode;
} & Omit<React.ComponentProps<"section">, "title">) {
	return (
		<section className={cn(CARD, !flush && CARD_BODY, flush && "p-0", className)} {...rest}>
			{(title != null || aside != null) && (
				<SectionHeader className="mb-0" title={title} subtitle={subtitle} aside={aside} />
			)}
			{children}
		</section>
	);
}
