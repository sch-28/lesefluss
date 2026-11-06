import type React from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Virtualizer } from "virtua";
import type { LibraryItem } from "./sort-filter";

const SCROLL_CONTAINER = '[data-scroll-restoration-id="app-scroll"]';

/** Tailwind's md / lg / xl breakpoints, matching GRID_CLASS's column counts. */
const COLUMN_BREAKPOINTS: readonly [minWidth: number, cols: number][] = [
	[1280, 6],
	[1024, 5],
	[768, 4],
];
const GRID_CLASS =
	"grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 [&:not(:last-child)]:pb-4";

const CONTENT_MAX_PX = 900;
const PADDING_PX = 16;
const GAP_PX = 16;
/** Cover (2:3) plus title and progress lines under it. */
const CARD_TEXT_PX = 72;
/** A 64px cover plus the row's bottom padding. */
const LIST_ROW_PX = 72;

/** A first guess at a row's height, so rows far from the viewport hold about
 *  their real space and a restored scroll offset lands near the same books. */
export function estimateRowPx(viewMode: "grid" | "list", cols: number, viewportPx: number): number {
	if (viewMode === "list") return LIST_ROW_PX;
	const content = Math.min(viewportPx, CONTENT_MAX_PX) - 2 * PADDING_PX;
	const coverWidth = (content - (cols - 1) * GAP_PX) / cols;
	return Math.round(coverWidth * 1.5 + CARD_TEXT_PX + GAP_PX);
}

function columnsFor(width: number): number {
	return COLUMN_BREAKPOINTS.find(([min]) => width >= min)?.[1] ?? 3;
}

function useGridColumns(): number {
	const [cols, setCols] = useState(() => columnsFor(window.innerWidth));
	useLayoutEffect(() => {
		const onResize = () => setCols(columnsFor(window.innerWidth));
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);
	return cols;
}

/** The app's scroll container and how far below its top this list starts. */
function useScroller(anchor: React.RefObject<HTMLDivElement | null>) {
	const scrollRef = useRef<HTMLElement | null>(null);
	const [startMargin, setStartMargin] = useState(0);
	useLayoutEffect(() => {
		const el = anchor.current;
		const scroller = el?.closest<HTMLElement>(SCROLL_CONTAINER) ?? null;
		scrollRef.current = scroller;
		if (!el || !scroller) return;
		const measure = () =>
			setStartMargin(
				el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop,
			);
		measure();
		// The header above grows and shrinks (search field, filter chips), which moves the list.
		const observer = new ResizeObserver(measure);
		const above = el.parentElement;
		if (above) observer.observe(above);
		return () => observer.disconnect();
	}, [anchor]);
	return { scrollRef, startMargin };
}

type Props = {
	items: readonly LibraryItem[];
	viewMode: "grid" | "list";
	renderItem: (item: LibraryItem) => React.ReactNode;
	containerRef?: React.RefObject<HTMLDivElement | null>;
	/** A tap or click on the gaps between and around the cards, not on one; a
	 *  scroll or drag that starts there is not a tap. */
	onBackgroundTap?: () => void;
};

const TAP_SLOP_PX = 10;

const itemKey = (item: LibraryItem) => (item.kind === "book" ? item.book.id : item.series.id);

/**
 * Grid and list, rendering only the rows near the viewport, so a library of
 * thousands of books filters and scrolls like a small one.
 */
const VirtualBookGrid: React.FC<Props> = ({
	items,
	viewMode,
	renderItem,
	containerRef,
	onBackgroundTap,
}) => {
	const ownAnchor = useRef<HTMLDivElement>(null);
	const anchor = containerRef ?? ownAnchor;
	const { scrollRef, startMargin } = useScroller(anchor);
	const gridCols = useGridColumns();
	const cols = viewMode === "grid" ? gridCols : 1;
	const rows = useMemo(() => {
		const out: LibraryItem[][] = [];
		for (let i = 0; i < items.length; i += cols) out.push(items.slice(i, i + cols));
		return out;
	}, [items, cols]);
	const pressAt = useRef<{ x: number; y: number } | null>(null);

	return (
		<div
			ref={anchor}
			className="p-4 pb-24 content-container"
			data-testid="library-items"
			onPointerDown={(e) => {
				pressAt.current = { x: e.clientX, y: e.clientY };
			}}
			onClick={(e) => {
				const from = pressAt.current;
				pressAt.current = null;
				if (!onBackgroundTap || (e.target as Element).closest("button, a, [data-book-id]")) return;
				if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > TAP_SLOP_PX) return;
				onBackgroundTap();
			}}
		>
			<Virtualizer
				scrollRef={scrollRef}
				startMargin={startMargin + PADDING_PX}
				bufferSize={600}
				itemSize={estimateRowPx(viewMode, cols, window.innerWidth)}
			>
				{rows.map((row) =>
					viewMode === "grid" ? (
						<div key={row.map(itemKey).join()} className={GRID_CLASS}>
							{row.map((item) => (
								<div key={itemKey(item)} className="min-w-0">
									{renderItem(item)}
								</div>
							))}
						</div>
					) : (
						<div key={itemKey(row[0] as LibraryItem)} className="[&:not(:last-child)]:pb-2">
							{renderItem(row[0] as LibraryItem)}
						</div>
					),
				)}
			</Virtualizer>
		</div>
	);
};

export default VirtualBookGrid;
