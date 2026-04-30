import { IonIcon } from "@ionic/react";
import { chevronBackOutline, chevronForwardOutline } from "ionicons/icons";
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
 * Featured hero — one book at a time, auto-advances every `intervalMs`.
 * Manual controls (prev/next arrows + clickable dots) reset the timer so
 * the next auto-advance is a full interval later, not whatever was left.
 */
const Hero: React.FC<Props> = ({ books, onOpen, intervalMs = 6000 }) => {
	const [index, setIndex] = useState(0);
	const pausedRef = useRef(false);
	// Bumped on any manual nav so the auto-advance effect restarts its timer.
	const [manualTick, setManualTick] = useState(0);

	// Reset + restart the carousel whenever the books array identity changes
	// or the user manually navigates. Depending only on `books.length` would
	// let a new set keep the stale index.
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
		<div
			className="explore-hero"
			onMouseEnter={() => {
				pausedRef.current = true;
			}}
			onMouseLeave={() => {
				pausedRef.current = false;
			}}
		>
			<button
				type="button"
				className="explore-hero-cover"
				onClick={() => onOpen(book)}
				aria-label={`Open ${book.title}`}
			>
				<CoverImage
					key={book.id}
					src={cover}
					alt=""
					priority
					fallback={<div className="explore-hero-cover-placeholder">BOOK</div>}
				/>
			</button>
			<div className="explore-hero-meta">
				<div className="explore-hero-eyebrow">Featured</div>
				<button type="button" className="explore-hero-title-btn" onClick={() => onOpen(book)}>
					<h2 className="explore-hero-title">{book.title}</h2>
					{book.author && <p className="explore-hero-author">{book.author}</p>}
				</button>
				{hasMultiple && (
					<div className="explore-hero-controls">
						<button
							type="button"
							className="explore-hero-arrow"
							onClick={() => goTo(index - 1)}
							aria-label="Previous featured book"
						>
							<IonIcon icon={chevronBackOutline} />
						</button>
						<div className="explore-hero-dots" role="tablist">
							{books.map((b, i) => (
								<button
									type="button"
									key={b.id}
									className={i === index ? "explore-hero-dot active" : "explore-hero-dot"}
									onClick={() => goTo(i)}
									aria-label={`Show featured book ${i + 1}`}
									aria-selected={i === index}
									role="tab"
								/>
							))}
						</div>
						<button
							type="button"
							className="explore-hero-arrow"
							onClick={() => goTo(index + 1)}
							aria-label="Next featured book"
						>
							<IonIcon icon={chevronForwardOutline} />
						</button>
					</div>
				)}
			</div>
		</div>
	);
};

export default Hero;
