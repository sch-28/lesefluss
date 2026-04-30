/**
 * ChunkContent — one mounted chunk in the sliding window.
 *
 * Self-contained multicol container that reports its measured scrollWidth
 * (= pageCount × pageWidth) to the parent and exposes its DOM element via a
 * registration callback so the parent can run measurement helpers against it.
 *
 * Memoized — re-renders only on prop changes. The activeOffset prop is scoped
 * by the parent (only the chunk containing the active byte gets the real
 * value; others get -1) so taps don't re-render the entire window.
 */
import type React from "react";
import { memo, useEffect, useLayoutEffect, useRef } from "react";
import Paragraph, { type GlossaryRangeProp, type HighlightRange } from "../paragraph";
import type { Chunk } from "./chunks";

export interface ChunkContentProps {
	chunk: Chunk;
	chunkIndex: number;
	paragraphs: string[];
	paragraphOffsets: number[];

	// Position in the transform wrapper (relative to current chunk; 0 for current).
	leftOffset: number;

	// Layout dimensions (explicit pixels — see PageView for the rationale).
	pageWidth: number;
	pageHeight: number;

	// Appearance
	fontSize: number;
	fontFamily: string;
	showActiveWordUnderline: boolean;
	lang: string;

	// Highlight + selection passthrough to <Paragraph>.
	activeOffset: number; // -1 if active word is in a different chunk
	highlightsByParagraph: Map<number, HighlightRange[]> | undefined;
	glossaryByParagraph: Map<number, GlossaryRangeProp[]> | undefined;
	selectionRange: { start: number; end: number } | null;

	// Word interaction
	onWordTap: (offset: number, text: string) => void;
	onWordLongPress: (offset: number) => void;
	onWordMouseDragStart: (offset: number, ev: PointerEvent) => void;

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
	paragraphOffsets,
	leftOffset,
	pageWidth,
	pageHeight,
	fontSize,
	fontFamily,
	showActiveWordUnderline,
	lang,
	activeOffset,
	highlightsByParagraph,
	glossaryByParagraph,
	selectionRange,
	onWordTap,
	onWordLongPress,
	onWordMouseDragStart,
	onMeasure,
	registerRef,
}) => {
	const ref = useRef<HTMLDivElement>(null);

	// Register element with parent on mount, deregister on unmount.
	useEffect(() => {
		const el = ref.current;
		registerRef(chunkIndex, el);
		return () => registerRef(chunkIndex, null);
	}, [chunkIndex, registerRef]);

	// Measure scrollWidth after each layout-affecting change. Wait for fonts on
	// cold start so column flow doesn't shift mid-measure.
	useLayoutEffect(() => {
		void fontSize;
		void fontFamily;
		if (!ref.current || pageWidth === 0 || pageHeight === 0) return;
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
	}, [chunkIndex, pageWidth, pageHeight, fontSize, fontFamily, onMeasure]);

	return (
		<div
			ref={ref}
			lang={lang}
			data-chunk-index={chunkIndex}
			style={{
				position: "absolute",
				left: `${leftOffset}px`,
				top: 0,
				// EXPLICIT pixel dimensions — multicol's `column-fill: auto` only
				// overflows into horizontally-stacked columns when the multicol
				// container has a definite block size. Otherwise it falls back to
				// "balance" and crams everything into a single tall column.
				width: `${pageWidth}px`,
				height: `${pageHeight}px`,
				columnWidth: `${pageWidth}px`,
				columnGap: 0,
				columnFill: "auto",
				hyphens: "auto",
				fontSize: `${fontSize}px`,
				fontFamily: fontFamily === "serif" ? "Georgia, 'Times New Roman', serif" : undefined,
			}}
		>
			{paragraphs.slice(chunk.paragraphFrom, chunk.paragraphTo).map((text, i) => {
				const paraGlobalIndex = chunk.paragraphFrom + i;
				const paraStart = paragraphOffsets[paraGlobalIndex];
				const paraEnd = paragraphOffsets[paraGlobalIndex + 1] ?? Number.POSITIVE_INFINITY;
				// Pass the real activeOffset only to the paragraph that contains it.
				const isActiveHere = activeOffset >= paraStart && activeOffset < paraEnd;
				return (
					<Paragraph
						key={paraGlobalIndex.toString()}
						text={text}
						startOffset={paraStart}
						activeOffset={isActiveHere ? activeOffset : -1}
						onWordTap={onWordTap}
						onWordLongPress={onWordLongPress}
						onWordMouseDragStart={onWordMouseDragStart}
						highlights={highlightsByParagraph?.get(paraGlobalIndex)}
						glossaryRanges={glossaryByParagraph?.get(paraGlobalIndex)}
						selectionRange={selectionRange}
						showActiveWordUnderline={showActiveWordUnderline}
					/>
				);
			})}
		</div>
	);
};

export default memo(ChunkContent);
