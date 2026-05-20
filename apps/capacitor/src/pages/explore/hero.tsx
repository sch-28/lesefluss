import { Button } from "@lesefluss/ui/button";
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

/**
 * Featured hero. One book at a time, auto-advances every `intervalMs`.
 * Manual controls (prev/next arrows + clickable dots) reset the timer so the
 * next auto-advance is a full interval later, not whatever was left.
 */
const Hero: React.FC<Props> = ({ books, onOpen, intervalMs = 6000 }) => {
	const [index, setIndex] = useState(0);
	const pausedRef = useRef(false);
	// Bumped on any manual nav so the auto-advance effect restarts its timer.
	const [manualTick, setManualTick] = useState(0);

	// Reset + restart the carousel whenever books identity changes or the user
	// manually navigates. Depending only on `books.length` would let a new set
	// keep the stale index.
	useEffect(() => {
		void manualTick;
		if (books.length <= 1) return;
		const id = setInterval(() => {
			if (!pausedRef.current) setIndex((i) => (i + 1) % books.length);
		}, intervalMs);
		return () => clearInterval(id);
	}, [books, intervalMs, manualTick]);

	useEffect(() => {
		void books;
		setIndex(0);
	}, [books]);

	const book = books[index];
	if (!book) return null;

	const cover = getCoverUrl(book.id, book.coverUrl);
	const hasMultiple = books.length > 1;

	const goTo = (next: number) => {
		const normalised = (next + books.length) % books.length;
		setIndex(normalised);
		setManualTick((t) => t + 1);
	};

	return (
		<section
			className="mb-6 flex gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground"
			onMouseEnter={() => {
				pausedRef.current = true;
			}}
			onMouseLeave={() => {
				pausedRef.current = false;
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
					src={cover}
					alt=""
					priority
					fallback={
						<div className="flex h-full items-center justify-center font-semibold text-muted-foreground text-xs">
							BOOK
						</div>
					}
				/>
			</button>
			<div className="flex min-w-0 flex-1 flex-col">
				<div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					Featured
				</div>
				<button
					type="button"
					className="mt-1 cursor-pointer border-0 bg-transparent p-0 text-left"
					onClick={() => onOpen(book)}
				>
					<h2 className="m-0 font-semibold text-base leading-tight">{book.title}</h2>
					{book.author && (
						<p className="mt-1 text-muted-foreground text-sm">{book.author}</p>
					)}
				</button>
				{hasMultiple && (
					<div className="mt-auto flex items-center gap-2 pt-3">
						<Button
							variant="ghost"
							size="icon-sm"
							onClick={() => goTo(index - 1)}
							aria-label="Previous featured book"
						>
							<ChevronLeft />
						</Button>
						<div className="flex flex-1 items-center justify-center gap-1.5" role="tablist">
							{books.map((b, i) => (
								<button
									type="button"
									key={b.id}
									onClick={() => goTo(i)}
									aria-label={`Show featured book ${i + 1}`}
									aria-selected={i === index}
									role="tab"
									className={cn(
										"size-1.5 rounded-full transition-colors",
										i === index ? "bg-primary" : "bg-muted-foreground/30",
									)}
								/>
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
		</section>
	);
};

export default Hero;
