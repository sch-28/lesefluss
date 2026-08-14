import { RATING_STARS, ratingStars, starFill } from "@lesefluss/core";
import { Star } from "lucide-react";
import type * as React from "react";
import { cn } from "../lib/utils";

/** 1-based star positions, the order every rating row renders in. */
export const STAR_POSITIONS = Array.from({ length: RATING_STARS }, (_, i) => i + 1);

/**
 * One star, filled none / half / full.
 *
 * A half is a filled star clipped to half width over an empty one, so the two
 * always align whatever the size. Sole owner of that markup: the app's edit
 * sheet wraps it in a tap target, the detail page and the website render it as
 * is.
 */
function StarGlyph({ fill, className }: { fill: 0 | 1 | 2; className?: string }) {
	return (
		<span className="relative inline-flex">
			<Star className={cn("text-muted-foreground/40", className)} />
			{fill > 0 && (
				<span className={cn("absolute inset-0 overflow-hidden", fill === 1 ? "w-1/2" : "w-full")}>
					<Star className={cn("max-w-none fill-primary text-primary", className)} />
				</span>
			)}
		</span>
	);
}

/** Read-only star row. `starClassName` sizes the glyphs; the default suits body text. */
function RatingStars({
	rating,
	className,
	starClassName = "size-3.5",
	...props
}: { rating: number; starClassName?: string } & React.ComponentProps<"span">) {
	return (
		<span
			role="img"
			className={cn("inline-flex items-center gap-0.5 align-middle", className)}
			aria-label={`Rated ${ratingStars(rating)} out of ${RATING_STARS}`}
			{...props}
		>
			{STAR_POSITIONS.map((star) => (
				<StarGlyph key={star} fill={starFill(rating, star)} className={starClassName} />
			))}
		</span>
	);
}

export { RatingStars, StarGlyph };
