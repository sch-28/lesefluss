import { useRouter } from "@tanstack/react-router";
import { motion } from "framer-motion";
import CoverImage from "../../../components/cover-image";
import type { ShelfBook } from "../../../services/db/queries/stats";

/**
 * Horizontal cover row shared by the stats shelves.
 *
 * Three shelves answer different questions from the same visual: what you are
 * in the middle of, what you finished, and what took the most time in a period.
 */
export function BookShelf({
	title,
	subtitle,
	books,
	isPending,
	emptyMessage,
	badgeFor,
}: {
	title: string;
	subtitle: string;
	books: ShelfBook[];
	isPending: boolean;
	emptyMessage: string;
	/** Optional overlay on the cover, e.g. rank or time read. */
	badgeFor?: (book: ShelfBook, index: number) => React.ReactNode;
}) {
	const history = useRouter().history;
	if (isPending) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.5 }}
			className="mb-10"
		>
			<header className="mb-3 px-4">
				<h2 className="font-semibold text-lg">{title}</h2>
				<p className="mt-0.5 text-[11px] uppercase tracking-wider opacity-60">{subtitle}</p>
			</header>
			{books.length === 0 ? (
				<p className="px-4 text-muted-foreground text-sm">{emptyMessage}</p>
			) : (
				<div className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2">
					{books.map((book, index) => (
						<motion.button
							key={book.id}
							type="button"
							onClick={() => history.push(book.href)}
							initial={{ opacity: 0, x: 16 }}
							whileInView={{ opacity: 1, x: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.4, delay: index * 0.06 }}
							whileTap={{ scale: 0.97 }}
							className="relative w-[120px] flex-shrink-0 snap-start border-0 bg-transparent p-0 text-left"
						>
							<div className="relative aspect-[2/3] overflow-hidden rounded-xl">
								<CoverImage src={book.coverImage} alt={book.title} />
								<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
								{badgeFor?.(book, index)}
								{book.percent !== undefined && book.percent > 0 && book.percent < 100 && (
									<div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
										<div className="h-full bg-primary" style={{ width: `${book.percent}%` }} />
									</div>
								)}
							</div>
							<div className="mt-2 px-0.5 text-foreground">
								<div className="line-clamp-1 font-medium text-sm">{book.title}</div>
								{book.author && (
									<div className="mt-0.5 line-clamp-1 text-[11px] opacity-60">{book.author}</div>
								)}
								<div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground tabular-nums">
									{book.detail}
								</div>
							</div>
						</motion.button>
					))}
				</div>
			)}
		</motion.section>
	);
}
