import { Button } from "@lesefluss/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";

type Props = {
	hasPrev: boolean;
	hasNext: boolean;
	onNext: () => void;
	onPrev: () => void;
};

/**
 * End-of-chapter previous/next navigation rendered after the last paragraph
 * (scroll view) or overlaid on the last page (page view). Boundary handling
 * is the caller's: pass `hasPrev=false` on chapter 0 and `hasNext=false` on
 * the last chapter (or while the chapter-counts query is loading). Returns
 * null when both are false.
 */
export const NextChapterFooter: React.FC<Props> = ({ hasPrev, hasNext, onNext, onPrev }) => {
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
					<ChevronRight />
				</Button>
			)}
		</div>
	);
};
