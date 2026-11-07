import { nextRating, ratingStars, starFill } from "@lesefluss/core";
import { Button } from "@lesefluss/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { STAR_POSITIONS, StarGlyph } from "@lesefluss/ui/rating-stars";
import type React from "react";
import { useEffect, useState } from "react";
import { bookCount } from "./bulk-summary";

type Props = {
	isOpen: boolean;
	count: number;
	onClose: () => void;
	/** Null takes the rating off every selected book. */
	onApply: (rating: number | null) => void;
};

const BulkRatingSheet: React.FC<Props> = ({ isOpen, count, onClose, onApply }) => {
	const [rating, setRating] = useState<number | null>(null);

	useEffect(() => {
		if (!isOpen) setRating(null);
	}, [isOpen]);

	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Rating · {bookCount(count)}</DrawerTitle>
				</DrawerHeader>
				<div className="flex items-center justify-center gap-1 px-4 pb-4">
					{STAR_POSITIONS.map((star) => (
						<button
							key={star}
							type="button"
							aria-label={`Rate ${star} star${star === 1 ? "" : "s"}`}
							onClick={() => setRating((current) => nextRating(current, star))}
							className="p-1"
						>
							<StarGlyph fill={starFill(rating, star)} className="size-8" />
						</button>
					))}
					<span className="ml-2 w-8 text-muted-foreground text-sm tabular-nums">
						{rating === null ? "" : ratingStars(rating)}
					</span>
				</div>
				<div className="flex gap-2 border-border border-t p-4">
					<Button variant="outline" className="flex-1" onClick={() => onApply(null)}>
						No rating
					</Button>
					<Button className="flex-1" disabled={rating === null} onClick={() => onApply(rating)}>
						Apply
					</Button>
				</div>
			</DrawerContent>
		</Drawer>
	);
};

export default BulkRatingSheet;
