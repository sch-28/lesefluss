import { Button } from "@lesefluss/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { formatReadingTime } from "../../utils/reading-time";

type Props = {
	hasPrev: boolean;
	hasNext: boolean;
	onNext: () => void;
	onPrev: () => void;
	/** The next chapter's reading time; null when its length is unknown or times are off. */
	nextMinutes?: number | null;
};

/**
 * End-of-chapter previous/next navigation rendered after the last paragraph
 * (scroll view) or overlaid on the last page (page view). Boundary handling
 * is the caller's: pass `hasPrev=false` on chapter 0 and `hasNext=false` on
 * the last chapter (or while the chapter-counts query is loading). Returns
 * null when both are false.
 */
export const NextChapterFooter: React.FC<Props> = ({
	hasPrev,
	hasNext,
	onNext,
	onPrev,
	nextMinutes = null,
}) => {
	if (!hasPrev && !hasNext) return null;

	return (
		<div className="next-chapter-footer">
			{hasPrev && (
				<Button variant="outline" onClick={onPrev}>
					<ChevronLeft />
					Previous
				</Button>
			)}
			{hasNext && (
				<Button variant="outline" onClick={onNext}>
					Next
					{nextMinutes !== null && (
						<span className="text-muted-foreground tabular-nums" data-testid="next-chapter-time">
							{formatReadingTime(nextMinutes)}
						</span>
					)}
					<ChevronRight />
				</Button>
			)}
		</div>
	);
};
