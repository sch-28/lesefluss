import { nextRating, ratingStars, starFill } from "@lesefluss/core";
import { STAR_POSITIONS, StarGlyph } from "@lesefluss/ui/rating-stars";
import type React from "react";

/** Five stars a tap sets; a second tap on a full star halves it. */
export const RatingInput: React.FC<{
	rating: number | null;
	onRate: (rating: number) => void;
}> = ({ rating, onRate }) => (
	<div className="flex items-center justify-center gap-1">
		{STAR_POSITIONS.map((star) => (
			<button
				key={star}
				type="button"
				aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
				onClick={() => onRate(nextRating(rating, star))}
				className="p-1"
			>
				<StarGlyph fill={starFill(rating, star)} className="size-8" />
			</button>
		))}
		<span className="ml-2 w-8 text-muted-foreground text-sm tabular-nums">
			{rating === null ? "" : ratingStars(rating)}
		</span>
	</div>
);
