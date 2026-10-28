import { cn } from "@lesefluss/ui/utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { announce } from "./reader-announcer";

export type GoalDividerProp = { label: string; passed: boolean };
export type ReaderGoalDivider = { paragraphIndex: number; divider: GoalDividerProp };

/**
 * Sits in the paragraph's bottom margin, absolutely positioned, so it adds no
 * height: virtualized scroll heights and page-mode pagination stay as they were.
 *
 * Page mode is a multicol layout. A paragraph that ends right at the bottom of
 * a page would push the divider to the top of the next column, over its first
 * line, and the last paragraph of a chunk would gain a blank page for it. The
 * divider is hidden in that case. Checked in a layout effect, which runs before
 * the chunk measures its pages, and again whenever the paragraph reflows.
 *
 * Only a pass seen happening is celebrated and announced: virtualized scroll
 * and mode switches remount the divider already passed.
 */
export function GoalDivider({ label, passed }: GoalDividerProp) {
	const ref = useRef<HTMLSpanElement>(null);
	const wasPassed = useRef(passed);
	const [celebrate, setCelebrate] = useState(false);
	// Before paint, so the pass shows up animated rather than flashing static first.
	useLayoutEffect(() => {
		if (passed && !wasPassed.current) setCelebrate(true);
		wasPassed.current = passed;
	}, [passed]);
	useLayoutEffect(() => {
		const el = ref.current;
		const paragraph = el?.parentElement;
		if (!el || !paragraph) return;
		const check = () => {
			el.style.display = "";
			const fragments = paragraph.getClientRects();
			const last = fragments[fragments.length - 1];
			const box = el.getBoundingClientRect();
			const spills = !!last && (Math.abs(box.left - last.left) > 1 || box.top < last.bottom - 1);
			el.style.display = spills ? "none" : "";
		};
		check();
		const observer = new ResizeObserver(check);
		observer.observe(paragraph);
		return () => observer.disconnect();
	}, []);
	const celebrating = passed && celebrate;
	useEffect(() => {
		if (celebrating) announce("Today's target met");
	}, [celebrating]);
	return (
		<span
			ref={ref}
			aria-hidden="true"
			data-testid="goal-divider"
			data-passed={passed}
			data-celebrate={celebrating}
			className={cn(
				"reader-goal-divider",
				passed && "reader-goal-divider--passed",
				celebrating && "reader-goal-divider--celebrate",
			)}
		>
			<span className="reader-goal-divider-line" />
			<span className="reader-goal-divider-label">
				{passed && "✓ "}today {label}
			</span>
			<span className="reader-goal-divider-line" />
		</span>
	);
}
