import { useEffect, useRef, useState } from "react";

/** A catalog blurb can run to several screens. Clamp to about eight lines and
 *  let the reader ask for the rest. */
const COLLAPSED_MAX_HEIGHT = 190;

/** Sub-pixel line heights make `scrollHeight` exceed the clamp by a hair on text
 *  that fits, which would show a Show more button that reveals nothing. */
const OVERFLOW_TOLERANCE = 8;

/**
 * Height-clamped block with a "Show more" toggle.
 *
 * Clamped rather than scrollable on purpose: a nested scroll area inside a page
 * that already scrolls swallows the gesture, and the description is prose to
 * skim, not a list to navigate.
 */
export function CollapsibleProse({ children }: { children: React.ReactNode }) {
	const contentRef = useRef<HTMLDivElement>(null);
	const [isExpanded, setIsExpanded] = useState(false);
	const [isOverflowing, setIsOverflowing] = useState(false);

	// Measured rather than guessed from character count: the same text is a
	// different number of lines depending on font size and viewport width.
	useEffect(() => {
		const el = contentRef.current;
		if (!el) return;
		const measure = () => setIsOverflowing(el.scrollHeight > COLLAPSED_MAX_HEIGHT + OVERFLOW_TOLERANCE);
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<div>
			<div
				ref={contentRef}
				className="relative overflow-hidden"
				style={isExpanded ? undefined : { maxHeight: COLLAPSED_MAX_HEIGHT }}
			>
				{children}
				{!isExpanded && isOverflowing && (
					<div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
				)}
			</div>
			{isOverflowing && (
				<button
					type="button"
					onClick={() => setIsExpanded((value) => !value)}
					className="mt-2 text-primary text-xs"
				>
					{isExpanded ? "Show less" : "Show more"}
				</button>
			)}
		</div>
	);
}
