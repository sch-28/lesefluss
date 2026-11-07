import { Input } from "@lesefluss/ui/input";
import { cn } from "@lesefluss/ui/utils";
import { Check, Search } from "lucide-react";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { Virtualizer } from "virtua";
import { applyLibraryView, buildLibraryItems } from "../../pages/library/sort-filter";
import { useGridColumns, useScroller } from "../../pages/library/virtual-book-grid";
import type { Book } from "../../services/db/schema";
import BookCover from "../book-cover";

export type QuickFilter = { id: string; label: string; matches: (book: Book) => boolean };

type Props = {
	books: readonly Book[];
	/** Iterated in pick order, which an ordered collection numbers by. */
	selected: ReadonlySet<string>;
	onSelectedChange: (next: Set<string>) => void;
	/** Shown ticked and not selectable, e.g. books already in the collection. */
	lockedIds?: ReadonlySet<string>;
	lockedLabel?: string;
	layout?: "rows" | "grid";
	/** Chips after All and Picked. */
	quickFilters?: readonly QuickFilter[];
	/** Shows each pick's place in `selected` as #N. */
	showOrder?: boolean;
	covers?: ReadonlyMap<string, string>;
};

const ALL = "all";
const PICKED = "picked";
const NONE: ReadonlySet<string> = new Set();
const NO_FILTERS: readonly QuickFilter[] = [];

const CHIP =
	"inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors";

/**
 * Search and pick books from the library. Controlled: it owns only its search
 * and chip, and never writes; the caller decides what a pick means.
 *
 * Shift-click picks or unpicks the range from the last row clicked, `x` toggles
 * the focused row.
 */
export const BookSelection: React.FC<Props> = ({
	books,
	selected,
	onSelectedChange,
	lockedIds = NONE,
	lockedLabel = "Added",
	layout = "rows",
	quickFilters = NO_FILTERS,
	showOrder = false,
	covers,
}) => {
	const [search, setSearch] = useState("");
	const [chip, setChip] = useState(ALL);
	const anchorRef = useRef<string | null>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const { scrollRef, startMargin } = useScroller(listRef);
	const gridCols = useGridColumns();
	const cols = layout === "grid" ? gridCols : 1;

	const items = useMemo(() => buildLibraryItems([...books], [], new Map()), [books]);
	const matching = useMemo(
		() =>
			applyLibraryView(items, { filter: {}, sortBy: "recent", search }).flatMap((it) =>
				it.kind === "book" ? [it.book] : [],
			),
		[items, search],
	);
	const activeFilter = quickFilters.find((f) => f.id === chip);
	const visible = useMemo(() => {
		if (chip === PICKED) return matching.filter((b) => selected.has(b.id));
		if (activeFilter) return matching.filter(activeFilter.matches);
		return matching;
	}, [matching, chip, activeFilter, selected]);

	const order = useMemo(() => {
		const out = new Map<string, number>();
		for (const id of selected) out.set(id, out.size + 1);
		return out;
	}, [selected]);

	const toggle = (id: string, extend: boolean) => {
		if (lockedIds.has(id)) return;
		const next = new Set(selected);
		const anchor = anchorRef.current;
		const from = anchor ? visible.findIndex((b) => b.id === anchor) : -1;
		const to = visible.findIndex((b) => b.id === id);
		if (extend && anchor && from >= 0 && to >= 0 && from !== to) {
			const pick = selected.has(anchor);
			const step = from < to ? 1 : -1;
			for (let i = from; i !== to + step; i += step) {
				const rowId = (visible[i] as Book).id;
				if (lockedIds.has(rowId)) continue;
				if (pick) next.add(rowId);
				else next.delete(rowId);
			}
		} else if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		anchorRef.current = id;
		onSelectedChange(next);
	};

	const rows = useMemo(() => {
		const out: Book[][] = [];
		for (let i = 0; i < visible.length; i += cols) out.push(visible.slice(i, i + cols));
		return out;
	}, [visible, cols]);

	const chips = [
		{ id: ALL, label: "All" },
		{ id: PICKED, label: selected.size > 0 ? `Picked · ${selected.size}` : "Picked" },
		...quickFilters,
	];

	const renderBook = (book: Book) => {
		const locked = lockedIds.has(book.id);
		const isOn = locked || selected.has(book.id);
		const place = showOrder && !locked ? order.get(book.id) : undefined;
		return (
			<button
				key={book.id}
				type="button"
				data-book-id={book.id}
				aria-pressed={isOn}
				disabled={locked}
				onMouseDown={(e) => {
					if (e.shiftKey) e.preventDefault();
				}}
				onClick={(e) => toggle(book.id, e.shiftKey)}
				onKeyDown={(e) => {
					if (e.key !== "x" || e.metaKey || e.ctrlKey || e.altKey) return;
					e.preventDefault();
					toggle(book.id, false);
				}}
				className={cn(
					"relative w-full rounded-lg border text-left transition-colors disabled:cursor-default",
					layout === "grid" ? "flex flex-col gap-1.5 p-1.5" : "flex items-center gap-3 p-2",
					isOn && !locked ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted",
					locked ? "opacity-60" : "",
				)}
			>
				<div className={layout === "grid" ? "aspect-[2/3] w-full" : "h-15 w-10 shrink-0"}>
					<BookCover book={book} size="full" cover={covers?.get(book.id) ?? null} />
				</div>
				<div className="min-w-0 flex-1">
					<p className="m-0 truncate font-medium text-sm">{book.title}</p>
					<p className="m-0 truncate text-muted-foreground text-xs">
						{locked ? lockedLabel : book.author}
					</p>
				</div>
				<span
					aria-hidden
					className={cn(
						"inline-flex size-6 shrink-0 items-center justify-center rounded-full border font-semibold text-xs tabular-nums",
						layout === "grid" ? "absolute top-3 right-3" : "",
						isOn
							? "border-primary bg-primary text-primary-foreground"
							: "border-border bg-background",
					)}
				>
					{place !== undefined ? `#${place}` : isOn ? <Check className="size-3.5" /> : null}
				</span>
			</button>
		);
	};

	return (
		<div className="flex flex-col gap-3">
			<div className="relative">
				<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="search"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search title or author"
					aria-label="Search books"
					className="h-9 pl-8"
				/>
			</div>
			<div
				role="toolbar"
				aria-label="Show"
				className="flex gap-2 overflow-x-auto [scrollbar-width:none]"
			>
				{chips.map((c) => (
					<button
						key={c.id}
						type="button"
						aria-pressed={chip === c.id}
						onClick={() => setChip(c.id)}
						className={cn(
							CHIP,
							chip === c.id
								? "border-primary bg-primary text-primary-foreground"
								: "border-border bg-card text-foreground",
						)}
					>
						{c.label}
					</button>
				))}
			</div>
			<div ref={listRef} data-testid="book-selection">
				{visible.length === 0 ? (
					<p className="m-0 py-8 text-center text-muted-foreground text-sm">
						{chip === PICKED ? "Nothing picked yet." : "No books match."}
					</p>
				) : (
					<Virtualizer scrollRef={scrollRef} startMargin={startMargin} bufferSize={600}>
						{rows.map((row) =>
							layout === "grid" ? (
								<div
									key={row.map((b) => b.id).join()}
									className="grid gap-2 pb-2"
									style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
								>
									{row.map(renderBook)}
								</div>
							) : (
								<div key={(row[0] as Book).id} className="pb-1">
									{renderBook(row[0] as Book)}
								</div>
							),
						)}
					</Virtualizer>
				)}
			</div>
		</div>
	);
};
