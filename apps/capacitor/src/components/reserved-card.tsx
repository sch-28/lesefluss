import { cn } from "@lesefluss/ui/utils";
import { Loader2 } from "lucide-react";
import type React from "react";

/**
 * Holds a loading card's place at its loaded height, so nothing below it moves
 * when the data arrives. A card returns null only for a final "nothing to
 * show", decided after it loaded.
 */
export function ReservedCard({
	isPending,
	height,
	className,
	children,
}: {
	isPending: boolean;
	/** The card's loaded height (px, or a CSS length), margins excluded: pass those as className. */
	height: number | string;
	className?: string;
	children?: React.ReactNode;
}) {
	if (!isPending) return children ?? null;
	return (
		<div
			role="status"
			aria-label="Loading"
			data-testid="reserved-card"
			className={cn("flex items-center justify-center", className)}
			style={{ height }}
		>
			<Loader2 aria-hidden="true" className="size-5 animate-spin text-muted-foreground" />
		</div>
	);
}
