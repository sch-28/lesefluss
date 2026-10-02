import { cn } from "@lesefluss/ui/utils";
import type React from "react";
import { useLayoutEffect, useRef } from "react";
import type { Chapter } from "../../services/db/schema";

interface ContentsListProps {
	chapters: Chapter[];
	currentIndex: number;
	onJump: (startWord: number) => void;
	/** Height of the scroller's bottom edge hidden below the screen at the sheet's initial snap point. */
	obscuredHeight: number;
	/** Called on mount when the current row would land in the obscured part. */
	onNeedsFullHeight: () => void;
}

/**
 * Must render inside a positioned scroll container: the current row is
 * brought into view by setting the parent's scrollTop from the row's offsetTop.
 */
const ContentsList: React.FC<ContentsListProps> = ({
	chapters,
	currentIndex,
	onJump,
	obscuredHeight,
	onNeedsFullHeight,
}) => {
	const listRef = useRef<HTMLUListElement>(null);
	const didScrollRef = useRef(false);

	// Once per mount, so a jump that updates currentIndex while the sheet
	// animates closed doesn't scroll the list. Near the top rather than
	// centered, because the sheet opens partly below the screen. The previous
	// row stays visible as context.
	useLayoutEffect(() => {
		if (didScrollRef.current) return;
		didScrollRef.current = true;
		const list = listRef.current;
		const row = list?.children[currentIndex];
		const scroller = list?.parentElement;
		if (!(row instanceof HTMLElement) || !scroller) return;
		const contextRow = row.previousElementSibling;
		const target = contextRow instanceof HTMLElement ? contextRow.offsetTop : 0;
		const scrollTop = Math.min(target, scroller.scrollHeight - scroller.clientHeight);
		scroller.scrollTop = scrollTop;
		// Near the end the scroll clamps and the row can land in the obscured part.
		if (row.offsetTop + row.offsetHeight - scrollTop > scroller.clientHeight - obscuredHeight) {
			onNeedsFullHeight();
		}
	}, [currentIndex, obscuredHeight, onNeedsFullHeight]);

	return (
		<ul ref={listRef} className="flex flex-col">
			{chapters.map((ch, i) => {
				const isOpen = i === currentIndex;
				return (
					<li key={i.toString()}>
						<button
							type="button"
							aria-current={isOpen ? "location" : undefined}
							onClick={() => onJump(ch.startWord)}
							className={cn(
								"w-full border-border border-b px-5 py-3 text-left text-foreground text-sm transition-colors hover:bg-muted",
								isOpen && "bg-primary/10 font-medium",
							)}
						>
							{ch.title}
						</button>
					</li>
				);
			})}
		</ul>
	);
};

export default ContentsList;
