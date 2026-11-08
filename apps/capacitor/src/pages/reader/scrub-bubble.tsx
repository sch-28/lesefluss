import type React from "react";

/** Chapter and percent above the progress bar: the drag target, or after a tap the current spot. */
export const ScrubBubble: React.FC<{ chapterTitle?: string; pct: number }> = ({
	chapterTitle,
	pct,
}) => (
	<div
		className="reader-scrub-bubble"
		style={{ left: `clamp(70px, ${pct}%, calc(100% - 70px))` }}
		role="status"
	>
		{chapterTitle && <span className="reader-scrub-bubble-chapter">{chapterTitle}</span>}
		<span>{Math.round(pct)}%</span>
	</div>
);
