import { Button } from "@lesefluss/ui/button";
import { usePrefersReducedMotion } from "@lesefluss/ui/use-prefers-reduced-motion";
import { cn } from "@lesefluss/ui/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import CoverImage from "../../components/cover-image";
import { type CatalogSearchResult, getCoverUrl } from "../../services/catalog/client";

type Props = {
	books: CatalogSearchResult[];
	onOpen: (book: CatalogSearchResult) => void;
	intervalMs?: number;
};

const SWIPE_MIN_PX = 40;
// After a touch, wait this long before auto-advancing again.
const TOUCH_PAUSE_MS = 10_000;
/**
 * Featured hero, one book at a time. Auto-advances unless the reader prefers
 * reduced motion, and holds still while hovered, focused or recently touched.
 * Swipe, arrows or dots move it; any manual move restarts the interval.
 */
const Hero: React.FC<Props> = ({ books, onOpen, intervalMs = 6000 }) => {
	const [index, setIndex] = useState(0);
	const [manualTick, setManualTick] = useState(0);
	const pausedUntilRef = useRef(0);
	const isHoveredRef = useRef(false);
	const isFocusedRef = useRef(false);
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	const prefersReducedMotion = usePrefersReducedMotion();

	// Compared by ids: a parent re-render hands over a fresh array of the same
	// books, which must not snap the carousel back to the first slide.
	const booksKey = books.map((b) => b.id).join("|");
	const [prevBooksKey, setPrevBooksKey] = useState(booksKey);
	if (prevBooksKey !== booksKey) {
		setPrevBooksKey(booksKey);
		setIndex(0);
	}

	const count = books.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: booksKey stands in for books, manualTick restarts the interval.
	useEffect(() => {
		if (count <= 1 || prefersReducedMotion) return;
		const id = setInterval(() => {
			if (isHoveredRef.current || isFocusedRef.current || Date.now() < pausedUntilRef.current)
				return;
			setIndex((i) => (i + 1) % count);
		}, intervalMs);
		return () => clearInterval(id);
	}, [booksKey, intervalMs, manualTick, prefersReducedMotion]);

	const book = books[index];
	if (!book) return null;

	const hasMultiple = books.length > 1;
	const goTo = (next: number) => {
		setIndex((next + books.length) % books.length);
		setManualTick((t) => t + 1);
	};

	return (
		<section
			aria-roledescription="carousel"
			aria-label="Featured books"
			className="mb-6 flex touch-pan-y gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground"
			onMouseEnter={() => {
				isHoveredRef.current = true;
			}}
			onMouseLeave={() => {
				isHoveredRef.current = false;
			}}
			// Keyboard focus pauses; a tap that leaves focus on a dot does not.
			onFocus={(e) => {
				isFocusedRef.current = e.target.matches(":focus-visible");
			}}
			onBlur={() => {
				isFocusedRef.current = false;
			}}
			onTouchStart={(e) => {
				pausedUntilRef.current = Date.now() + TOUCH_PAUSE_MS;
				const t = e.touches[0];
				touchStartRef.current = t ? { x: t.clientX, y: t.clientY } : null;
			}}
			onTouchEnd={(e) => {
				const start = touchStartRef.current;
				const end = e.changedTouches[0];
				touchStartRef.current = null;
				if (!hasMultiple || !start || !end) return;
				const dx = end.clientX - start.x;
				const dy = end.clientY - start.y;
				// A mostly vertical drag is the page scrolling, not a swipe.
				if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) {
					goTo(index + (dx < 0 ? 1 : -1));
				}
			}}
		>
			<button
				type="button"
				className="aspect-2/3 w-28 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
				onClick={() => onOpen(book)}
				aria-label={`Open ${book.title}`}
			>
				<CoverImage
					key={book.id}
					src={getCoverUrl(book.id, book.coverUrl)}
					alt=""
					priority
					fallback={
						<div className="flex h-full items-center justify-center font-semibold text-muted-foreground text-xs">
							BOOK
						</div>
					}
				/>
			</button>
			<div className="flex min-w-0 flex-1 flex-col" aria-live="off">
				<div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					Featured
				</div>
				<h2 className="m-0 mt-1 font-semibold text-base leading-tight">{book.title}</h2>
				{book.author && <p className="m-0 mt-1 text-muted-foreground text-sm">{book.author}</p>}
				{book.summary && (
					<p className="m-0 mt-1.5 line-clamp-1 text-foreground/80 text-sm">{book.summary}</p>
				)}
				<div className="mt-auto pt-3">
					<Button size="sm" onClick={() => onOpen(book)}>
						View book
					</Button>
					{hasMultiple && (
						<div className="-mx-1 mt-1 flex items-center">
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => goTo(index - 1)}
								aria-label="Previous featured book"
							>
								<ChevronLeft />
							</Button>
							<div className="flex items-center" role="tablist">
								{books.map((b, i) => (
									<button
										type="button"
										key={b.id}
										onClick={() => goTo(i)}
										aria-label={`Show featured book ${i + 1}`}
										aria-selected={i === index}
										role="tab"
										className="flex size-6 items-center justify-center border-0 bg-transparent p-0"
									>
										<span
											className={cn(
												"size-1.5 rounded-full transition-colors",
												i === index ? "bg-primary" : "bg-muted-foreground/30",
											)}
										/>
									</button>
								))}
							</div>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={() => goTo(index + 1)}
								aria-label="Next featured book"
							>
								<ChevronRight />
							</Button>
						</div>
					)}
				</div>
			</div>
		</section>
	);
};

export default Hero;
