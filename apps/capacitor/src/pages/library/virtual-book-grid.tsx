import { cn } from "@lesefluss/ui/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import type React from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type CacheSnapshot, Virtualizer, type VirtualizerHandle } from "virtua";
import { itemKey, type LibraryGroup, layoutRows } from "./group-by";
import { rowTokens } from "./library-focus";
import type { LibraryItem } from "./sort-filter";

const SCROLL_CONTAINER = '[data-scroll-restoration-id="app-scroll"]';

/** Tailwind's md / lg / xl breakpoints. */
const COLUMN_BREAKPOINTS: readonly [minWidth: number, cols: number][] = [
	[1280, 6],
	[1024, 5],
	[768, 4],
];
/** In rem, so a large system font on a phone gets two wider cards rather than three cut ones. */
const TWO_COLUMNS_BELOW_REM = 20;
const GRID_CLASS = "grid gap-4 pb-4";

const CONTENT_MAX_PX = 900;
const PADDING_PX = 16;
const GAP_PX = 16;
/** Cover (2:3) plus title, author and status lines under it. */
const CARD_TEXT_PX = 72;
/** A 64px row; its border is its only separator. */
const LIST_ROW_PX = 64;

/** A first guess at a row's height, so rows far from the viewport hold about
 *  their real space and a restored scroll offset lands near the same books. */
export function estimateRowPx(viewMode: "grid" | "list", cols: number, viewportPx: number): number {
	if (viewMode === "list") return LIST_ROW_PX;
	const content = Math.min(viewportPx, CONTENT_MAX_PX) - 2 * PADDING_PX;
	const coverWidth = (content - (cols - 1) * GAP_PX) / cols;
	return Math.round(coverWidth * 1.5 + CARD_TEXT_PX + GAP_PX);
}

export function columnsFor(widthPx: number, remPx: number): number {
	const cols = COLUMN_BREAKPOINTS.find(([min]) => widthPx >= min)?.[1] ?? 3;
	return cols === 3 && widthPx < TWO_COLUMNS_BELOW_REM * remPx ? 2 : cols;
}

function viewportColumns(): number {
	const remPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
	return columnsFor(window.innerWidth, remPx);
}

export function useGridColumns(): number {
	const [cols, setCols] = useState(viewportColumns);
	useLayoutEffect(() => {
		const update = () => setCols(viewportColumns());
		update();
		window.addEventListener("resize", update);
		// The app font size lands on the root's inline style after the grid mounts on a cold start.
		const rootStyle = new MutationObserver(update);
		rootStyle.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
		return () => {
			window.removeEventListener("resize", update);
			rootStyle.disconnect();
		};
	}, []);
	return cols;
}

/** The app's scroll container and how far below its top this list starts. */
export function useScroller(anchor: React.RefObject<HTMLDivElement | null>) {
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

/**
 * Brings the keyboard-focused item's row into view when the focus moves.
 * virtua renders the row first; the focused element's own scroll margin then
 * keeps it clear of the sticky headers, which virtua does not know about.
 */
export function useScrollToFocused(
	tokens: readonly (readonly string[] | null)[],
	focusedKey: string | null | undefined,
): React.RefObject<VirtualizerHandle | null> {
	const handle = useRef<VirtualizerHandle>(null);
	const tokensRef = useRef(tokens);
	tokensRef.current = tokens;
	useEffect(() => {
		if (!focusedKey) return;
		const index = tokensRef.current.findIndex((row) => row?.includes(focusedKey));
		if (index < 0) return;
		handle.current?.scrollToIndex(index, { align: "nearest" });
		const frame = requestAnimationFrame(() => {
			document.querySelector("[data-focused]")?.scrollIntoView({ block: "nearest" });
		});
		return () => cancelAnimationFrame(frame);
	}, [focusedKey]);
	return handle;
}

/** The keyboard focus ring, drawn on the wrapper so cards need no prop for it. */
export const FOCUS_RING =
	"rounded-md ring-2 ring-primary ring-offset-2 ring-offset-background scroll-mt-[calc(var(--safe-top,0px)+4rem)] scroll-mb-24";

type Props = {
	items: readonly LibraryItem[];
	viewMode: "grid" | "list";
	renderItem: (item: LibraryItem) => React.ReactNode;
	containerRef?: React.RefObject<HTMLDivElement | null>;
	/** Sections with a heading each; null shows the items as one run. */
	groups?: readonly LibraryGroup[] | null;
	collapsed?: ReadonlySet<string>;
	onToggleGroup?: (groupKey: string) => void;
	/** A tap or click on the gaps between and around the cards, not on one; a
	 *  scroll or drag that starts there is not a tap. */
	onBackgroundTap?: () => void;
	/** The item the library's arrow keys are on. */
	focusedKey?: string | null;
};

const TAP_SLOP_PX = 10;

/** The tap's own click follows its pointerup; once the tap has left selection,
 *  that click would land on whatever just became interactive (a series card, the FAB). */
function swallowNextClick() {
	const swallow = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
	};
	window.addEventListener("click", swallow, { capture: true, once: true });
	setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 500);
}
const NONE_COLLAPSED: ReadonlySet<string> = new Set();

/**
 * The measured row sizes of the last library this layout showed. Restored on
 * mount, so the router's restored scroll offset lands on the same books after a
 * trip to the reader instead of on rows virtua only estimated.
 */
const sizeCaches = new Map<string, CacheSnapshot>();

export function sizeCacheKey(
	viewMode: "grid" | "list",
	cols: number,
	rowKeys: readonly string[],
): string {
	return `${viewMode}:${cols}:${rowKeys.length}:${rowKeys[0] ?? ""}:${rowKeys.at(-1) ?? ""}`;
}

export function clearSizeCaches() {
	sizeCaches.clear();
}

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
	groups = null,
	collapsed = NONE_COLLAPSED,
	onToggleGroup,
	focusedKey = null,
}) => {
	const ownAnchor = useRef<HTMLDivElement>(null);
	const anchor = containerRef ?? ownAnchor;
	const { scrollRef, startMargin } = useScroller(anchor);
	const gridCols = useGridColumns();
	const cols = viewMode === "grid" ? gridCols : 1;
	const rows = useMemo(
		() => layoutRows(items, groups, cols, collapsed),
		[items, groups, cols, collapsed],
	);
	const pressAt = useRef<{ x: number; y: number } | null>(null);
	const tokens = useMemo(() => rowTokens(rows), [rows]);
	const virtualizer = useScrollToFocused(tokens, focusedKey);
	const cacheKey = sizeCacheKey(
		viewMode,
		cols,
		rows.map((row) => (row.type === "header" ? `\u0001${row.group.key}` : row.key)),
	);
	// The snapshot is read once per mount; virtua ignores a later change of the prop.
	const [initialCache] = useState(() => sizeCaches.get(cacheKey));
	const cacheKeyRef = useRef(cacheKey);
	cacheKeyRef.current = cacheKey;
	// Layout cleanup: it runs before virtua's own handle is detached.
	useLayoutEffect(
		() => () => {
			const cache = virtualizer.current?.cache;
			if (cache) sizeCaches.set(cacheKeyRef.current, cache);
		},
		[virtualizer],
	);

	return (
		<div
			ref={anchor}
			className="p-4 pb-24 content-container"
			data-testid="library-items"
			onPointerDown={(e) => {
				pressAt.current = { x: e.clientX, y: e.clientY };
			}}
			// Pointer, not onClick: React gives an onClick element a click handler, and
			// TalkBack then offers a nameless "double-tap to activate" on the whole grid.
			onPointerUp={(e) => {
				const from = pressAt.current;
				pressAt.current = null;
				if (e.button !== 0) return;
				if (!onBackgroundTap || (e.target as Element).closest("button, a, [data-book-id]")) return;
				if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > TAP_SLOP_PX) return;
				onBackgroundTap();
				swallowNextClick();
			}}
		>
			<Virtualizer
				ref={virtualizer}
				scrollRef={scrollRef}
				startMargin={startMargin + PADDING_PX}
				bufferSize={600}
				itemSize={estimateRowPx(viewMode, cols, window.innerWidth)}
				cache={initialCache}
			>
				{rows.map((row, rowIndex) => {
					if (row.type === "header") {
						const Chevron = row.collapsed ? ChevronRight : ChevronDown;
						return (
							<div key={`\u0001${row.group.key}`} className="pb-2">
								<button
									type="button"
									aria-expanded={!row.collapsed}
									data-testid="library-group-header"
									onClick={() => onToggleGroup?.(row.group.key)}
									className="flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-1 py-2 text-left text-foreground hover:bg-muted"
								>
									<Chevron className="size-4 shrink-0 text-muted-foreground" />
									<span className="min-w-0 truncate font-semibold text-sm">{row.group.label}</span>
									<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
										{row.group.items.length}
									</span>
								</button>
							</div>
						);
					}
					const cell = (item: LibraryItem, column: number, className?: string) => {
						const key = itemKey(item);
						const isFocused = focusedKey !== null && tokens[rowIndex]?.[column] === focusedKey;
						return (
							<div
								key={key}
								data-focused={isFocused || undefined}
								className={cn(className, isFocused && FOCUS_RING)}
							>
								{renderItem(item)}
							</div>
						);
					};
					return viewMode === "grid" ? (
						<div
							key={row.key}
							className={GRID_CLASS}
							style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
						>
							{row.items.map((item, column) => cell(item, column, "min-w-0"))}
						</div>
					) : (
						<div key={row.key}>{cell(row.items[0] as LibraryItem, 0)}</div>
					);
				})}
			</Virtualizer>
		</div>
	);
};

export default VirtualBookGrid;
