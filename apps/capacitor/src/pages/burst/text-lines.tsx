import type { WordEntry } from "@lesefluss/core";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

/** Words laid out around the current one; enough to fill three lines on either side. */
const WINDOW_BEFORE = 50;
const WINDOW_AFTER = 70;

export type WordBox = { index: number; top: number; left: number; width: number };

/**
 * The word on the line above or below `current` nearest to it horizontally, or
 * null at the edge of the laid-out words.
 */
export function wordOnAdjacentLine(
	boxes: readonly WordBox[],
	current: number,
	direction: 1 | -1,
): number | null {
	const here = boxes.find((b) => b.index === current);
	if (!here) return null;
	const lineTops = [...new Set(boxes.map((b) => b.top))].sort((a, b) => a - b);
	const line = lineTops[lineTops.indexOf(here.top) + direction];
	if (line === undefined) return null;
	const center = here.left + here.width / 2;
	let best: WordBox | null = null;
	for (const box of boxes) {
		if (box.top !== line) continue;
		const distance = Math.abs(box.left + box.width / 2 - center);
		if (!best || distance < Math.abs(best.left + best.width / 2 - center)) best = box;
	}
	return best?.index ?? null;
}

export type TextLinesHandle = { wordOnLine(direction: 1 | -1): number | null };

type Props = { words: readonly WordEntry[]; index: number };

/** Three lines of the book with the current word on the middle one, underlined. */
export const TextLines = forwardRef<TextLinesHandle, Props>(function TextLines(
	{ words, index },
	ref,
) {
	const boxRef = useRef<HTMLDivElement>(null);
	const [offset, setOffset] = useState(0);
	const start = Math.max(0, index - WINDOW_BEFORE);
	const end = Math.min(words.length, index + WINDOW_AFTER);

	const measure = (): WordBox[] => {
		const spans = boxRef.current?.querySelectorAll<HTMLElement>("[data-word]") ?? [];
		return Array.from(spans, (span) => ({
			index: Number(span.dataset.word),
			top: span.offsetTop,
			left: span.offsetLeft,
			width: span.offsetWidth,
		}));
	};

	useImperativeHandle(ref, () => ({
		wordOnLine: (direction) => wordOnAdjacentLine(measure(), index, direction),
	}));

	useLayoutEffect(() => {
		const current = boxRef.current?.querySelector<HTMLElement>(`[data-word="${index}"]`);
		const lineHeight = current?.offsetHeight ?? 0;
		setOffset(current ? Math.max(0, current.offsetTop - lineHeight) : 0);
	}, [index]);

	return (
		<div className="h-[4.5em] overflow-hidden text-[15px] leading-[1.5em]">
			<div ref={boxRef} className="relative" style={{ transform: `translateY(${-offset}px)` }}>
				{words.slice(start, end).map((entry, i) => {
					const at = start + i;
					return (
						<span
							key={at}
							data-word={at}
							className={
								at === index
									? "text-foreground shadow-[inset_0_-2px_0_var(--primary)]"
									: "text-muted-foreground"
							}
						>
							{entry.word}{" "}
						</span>
					);
				})}
			</div>
		</div>
	);
});
