/**
 * ChunkContent — one mounted chunk in the sliding window.
 *
 * Self-contained multicol container that reports its measured scrollWidth
 * (the right edge of its last column) to the parent and exposes its DOM
 * element via a registration callback so the parent can run measurement
 * helpers against it.
 *
 * Memoized — re-renders only on prop changes. The activeOffset prop is scoped
 * by the parent (only the chunk containing the active byte gets the real
 * value; others get -1) so taps don't re-render the entire window.
 */
import type React from "react";
import { memo, useLayoutEffect, useRef } from "react";
import {
	readerFontStack,
	type TextAlign,
	type TextSpacing,
	textSpacingKey,
} from "../../../hooks/use-appearance-settings";
import type { ReaderGoalDivider } from "../goal-divider";
import Paragraph, {
	type GlossaryRangeProp,
	type HighlightRange,
	type LinkRangeProp,
	type ParagraphWordEntry,
} from "../paragraph";
import { renderFigures } from "../reader-figure";
import type { ReaderFigureData } from "../reader-figures";
import type { Chunk } from "./chunks";

export interface ChunkContentProps {
	chunk: Chunk;
	chunkIndex: number;
	paragraphs: string[];
	paragraphStartWords: number[];
	entriesByParagraph: ParagraphWordEntry[][];
	/** Paragraph index → chapter title rendered as an inline header above it. */
	chapterHeadingByParagraph?: Map<number, string>;
	/** Paragraph index → body images rendered above it. */
	figuresByParagraph?: Map<number, ReaderFigureData[]>;
	/** Body images after the last word; rendered by the chunk holding the last paragraph. */
	trailingFigures?: ReaderFigureData[];

	// Position in the transform wrapper (relative to current chunk; 0 for current).
	leftOffset: number;
	/** A neighbour pre-mounted beside the current chunk: off screen, so out of the a11y tree. */
	isOffscreen: boolean;

	// Layout dimensions (explicit pixels — see PageView for the rationale).
	columnWidth: number;
	columnGap: number;
	/** Columns per page: 1, or 2 for a spread. */
	columnCount: number;
	pageHeight: number;

	// Appearance
	fontSize: number;
	fontFamily: string;
	/*
	 * lineSpacing, isBold, fontLoads, textSpacing, textAlign: applied by the parent (CSS
	 * variables, a face loading late) rather than here, but they reflow the column
	 * flow all the same, so the measure effect below observes them or the
	 * reported width goes stale.
	 */
	lineSpacing: number;
	isBold: boolean;
	fontLoads: number;
	textSpacing: TextSpacing;
	textAlign: TextAlign;
	showActiveWordUnderline: boolean;
	lang: string;

	// Highlight + selection passthrough to <Paragraph>.
	activeWord: number; // -1 if active word is in a different chunk
	highlightsByParagraph: Map<number, HighlightRange[]> | undefined;
	glossaryByParagraph: Map<number, GlossaryRangeProp[]> | undefined;
	linksByParagraph: Map<number, LinkRangeProp[]> | undefined;
	discussionByParagraph?: Map<number, { count: number; onTap: () => void }>;
	/** Today's reading-goal divider and the paragraph it closes. */
	goalDivider?: ReaderGoalDivider;
	selectionRange: { startWord: number; endWord: number } | null;

	// Reports (chunkIndex, scrollWidth) once layout settles. Re-fires on
	// appearance changes that affect column flow.
	onMeasure: (chunkIndex: number, width: number) => void;

	// Lets the parent acquire/release the underlying element for cross-chunk
	// DOM queries (findPageForByte, readFirstVisibleByteOffset).
	registerRef: (chunkIndex: number, el: HTMLDivElement | null) => void;
}

const ChunkContent: React.FC<ChunkContentProps> = ({
	chunk,
	chunkIndex,
	paragraphs,
	paragraphStartWords,
	entriesByParagraph,
	chapterHeadingByParagraph,
	figuresByParagraph,
	trailingFigures,
	leftOffset,
	isOffscreen,
	columnWidth,
	columnGap,
	columnCount,
	pageHeight,
	fontSize,
	fontFamily,
	lineSpacing,
	isBold,
	fontLoads,
	textSpacing,
	textAlign,
	showActiveWordUnderline,
	lang,
	activeWord,
	highlightsByParagraph,
	glossaryByParagraph,
	linksByParagraph,
	discussionByParagraph,
	goalDivider,
	selectionRange,
	onMeasure,
	registerRef,
}) => {
	const ref = useRef<HTMLDivElement>(null);

	// A layout effect, so the parent's lander (also a layout effect, run after
	// the children's) can already read this element on the commit it mounts in.
	useLayoutEffect(() => {
		const el = ref.current;
		registerRef(chunkIndex, el);
		return () => registerRef(chunkIndex, null);
	}, [chunkIndex, registerRef]);

	const spacingKey = textSpacingKey(textSpacing);
	// Measure scrollWidth after each layout-affecting change. Wait for fonts on
	// cold start so column flow doesn't shift mid-measure.
	useLayoutEffect(() => {
		void columnGap;
		void columnCount;
		void fontSize;
		void fontFamily;
		void lineSpacing;
		void isBold;
		void fontLoads;
		void spacingKey;
		void textAlign;
		void lang;
		void figuresByParagraph;
		void trailingFigures;
		if (!ref.current || columnWidth === 0 || pageHeight === 0) return;
		let cancelled = false;
		const apply = () => {
			if (cancelled || !ref.current) return;
			onMeasure(chunkIndex, ref.current.scrollWidth);
		};
		if (document.fonts && document.fonts.status !== "loaded") {
			void document.fonts.ready.then(apply);
		} else {
			apply();
		}
		return () => {
			cancelled = true;
		};
	}, [
		chunkIndex,
		columnWidth,
		columnGap,
		columnCount,
		pageHeight,
		fontSize,
		fontFamily,
		lineSpacing,
		isBold,
		fontLoads,
		spacingKey,
		textAlign,
		lang,
		figuresByParagraph,
		trailingFigures,
		onMeasure,
	]);

	const width = columnCount * columnWidth + (columnCount - 1) * columnGap;
	// A spread fixes the count: from a width alone, rounding could fit one column.
	const columnStyle: React.CSSProperties =
		columnCount > 1
			? { columnCount, columnGap: `${columnGap}px` }
			: { columnWidth: `${columnWidth}px`, columnGap: 0 };

	return (
		<div
			ref={ref}
			lang={lang}
			data-chunk-index={chunkIndex}
			aria-hidden={isOffscreen || undefined}
			style={
				{
					position: "absolute",
					left: `${leftOffset}px`,
					top: 0,
					"--reader-page-height": `${pageHeight}px`,
					// EXPLICIT pixel dimensions — multicol's `column-fill: auto` only
					// overflows into horizontally-stacked columns when the multicol
					// container has a definite block size. Otherwise it falls back to
					// "balance" and crams everything into a single tall column.
					width: `${width}px`,
					height: `${pageHeight}px`,
					...columnStyle,
					columnFill: "auto",
					fontSize: `${fontSize}px`,
					fontFamily: readerFontStack(fontFamily),
				} as React.CSSProperties
			}
		>
			{paragraphs.slice(chunk.paragraphFrom, chunk.paragraphTo).map((text, i) => {
				const paraGlobalIndex = chunk.paragraphFrom + i;
				const paraStartWord = paragraphStartWords[paraGlobalIndex] ?? 0;
				const paraEndWord = paragraphStartWords[paraGlobalIndex + 1] ?? Number.POSITIVE_INFINITY;
				const isActiveWordHere = activeWord >= paraStartWord && activeWord < paraEndWord;
				return (
					<Paragraph
						key={paraGlobalIndex.toString()}
						text={text}
						entries={entriesByParagraph[paraGlobalIndex] ?? []}
						activeWord={isActiveWordHere ? activeWord : -1}
						highlights={highlightsByParagraph?.get(paraGlobalIndex)}
						glossaryRanges={glossaryByParagraph?.get(paraGlobalIndex)}
						links={linksByParagraph?.get(paraGlobalIndex)}
						discussion={discussionByParagraph?.get(paraGlobalIndex)}
						isOffscreen={isOffscreen}
						goalDivider={
							goalDivider?.paragraphIndex === paraGlobalIndex ? goalDivider.divider : undefined
						}
						chapterHeading={chapterHeadingByParagraph?.get(paraGlobalIndex)}
						figures={figuresByParagraph?.get(paraGlobalIndex)}
						selectionRange={selectionRange}
						showActiveWordUnderline={showActiveWordUnderline}
					/>
				);
			})}
			{chunk.paragraphTo === paragraphs.length && renderFigures(trailingFigures)}
		</div>
	);
};

export default memo(ChunkContent);
