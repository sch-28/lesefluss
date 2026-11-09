import { cn } from "@lesefluss/ui/utils";
import { useRouter } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import CoverImage from "../../../components/cover-image";
import { ReservedCard } from "../../../components/reserved-card";
import { queryHooks } from "../../../services/db/hooks";
import { useBookActions } from "../book-actions/use-book-actions";
import { SectionHeader } from "./section-header";
import { TitleCover } from "./title-cover";

/** One row: a 72px cover inside the card's padding and border. */
const BOOK_ROW_HEIGHT = 98;

/**
 * What the reader is in the middle of, as full-width rows rather than a cover
 * shelf: most readers have one or two books going, and a shelf sized for ten
 * covers renders one cover and a row of empty space.
 *
 * Hidden entirely once loaded with nothing in progress; an empty-state
 * sentence here would only pad the page the redesign is trying to tighten.
 */
export function CurrentlyReading() {
	const books = queryHooks.useStatsCurrentlyReading();
	const history = useRouter().history;
	const { data: library } = queryHooks.useBooks();
	const bookActions = useBookActions({ surface: "stats" });
	const rows = books.data ?? [];
	if (!books.isPending && rows.length === 0) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.5 }}
			className="mt-6 px-4"
		>
			<SectionHeader title="Currently reading" />
			<ReservedCard isPending={books.isPending} height={BOOK_ROW_HEIGHT}>
				<div className="flex flex-col gap-2.5">
					{rows.map((book, index) => {
						// A rolled-up serial has no single book row, so no book menu.
						const row = library?.books.find((b) => b.id === book.id);
						return (
							<motion.div
								key={book.id}
								initial={{ opacity: 0, x: 16 }}
								whileInView={{ opacity: 1, x: 0 }}
								viewport={{ once: true }}
								transition={{ duration: 0.4, delay: index * 0.06 }}
								className="relative"
							>
								<motion.button
									type="button"
									onClick={() => history.push(book.href)}
									whileTap={{ scale: 0.98 }}
									className={cn(
										"flex w-full items-center gap-3 rounded-xl border border-current/10 bg-card p-3 text-left text-card-foreground",
										row && "pr-12",
									)}
								>
									<div className="relative aspect-[2/3] w-12 flex-shrink-0 overflow-hidden rounded-md">
										<CoverImage
											src={book.coverImage}
											alt={book.title}
											fallback={<TitleCover title={book.title} />}
										/>
									</div>
									<div className="min-w-0 flex-1">
										<div className="line-clamp-1 font-medium text-sm">{book.title}</div>
										{book.author && (
											<div className="mt-0.5 line-clamp-1 text-[0.6875rem] opacity-60">
												{book.author}
											</div>
										)}
										<div className="mt-2 h-1 overflow-hidden rounded-full bg-current/10">
											<div
												className="h-full rounded-full bg-primary"
												style={{ width: `${book.percent ?? 0}%` }}
											/>
										</div>
										<div className="mt-1 text-[0.6875rem] text-muted-foreground tabular-nums">
											{book.detail}
										</div>
									</div>
								</motion.button>
								{row && (
									<button
										type="button"
										aria-label={`More for ${book.title}`}
										onClick={() => bookActions.open(row)}
										className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
									>
										<MoreHorizontal className="size-5" />
									</button>
								)}
							</motion.div>
						);
					})}
				</div>
			</ReservedCard>
			{bookActions.overlays}
		</motion.section>
	);
}
