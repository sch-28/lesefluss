import { useRouter } from "@tanstack/react-router";
import { motion } from "framer-motion";
import CoverImage from "../../../components/cover-image";
import { queryHooks } from "../../../services/db/hooks";

/**
 * What the reader is in the middle of, as full-width rows rather than a cover
 * shelf: most readers have one or two books going, and a shelf sized for ten
 * covers renders one cover and a row of empty space.
 *
 * Hidden entirely when nothing is in progress; an empty-state sentence here
 * would only pad the page the redesign is trying to tighten.
 */
export function CurrentlyReading() {
	const books = queryHooks.useStatsCurrentlyReading();
	const history = useRouter().history;
	const rows = books.data ?? [];
	if (books.isPending || rows.length === 0) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.5 }}
			className="mb-10 px-4"
		>
			<header className="mb-3">
				<h2 className="font-semibold text-lg">Currently reading</h2>
			</header>
			<div className="flex flex-col gap-2.5">
				{rows.map((book, index) => (
					<motion.button
						key={book.id}
						type="button"
						onClick={() => history.push(book.href)}
						initial={{ opacity: 0, x: 16 }}
						whileInView={{ opacity: 1, x: 0 }}
						viewport={{ once: true }}
						transition={{ duration: 0.4, delay: index * 0.06 }}
						whileTap={{ scale: 0.98 }}
						className="flex w-full items-center gap-3 rounded-xl border border-current/10 bg-card p-3 text-left text-card-foreground"
					>
						<div className="relative aspect-[2/3] w-12 flex-shrink-0 overflow-hidden rounded-md">
							<CoverImage src={book.coverImage} alt={book.title} />
						</div>
						<div className="min-w-0 flex-1">
							<div className="line-clamp-1 font-medium text-sm">{book.title}</div>
							{book.author && (
								<div className="mt-0.5 line-clamp-1 text-[11px] opacity-60">{book.author}</div>
							)}
							<div className="mt-2 h-1 overflow-hidden rounded-full bg-current/10">
								<div
									className="h-full rounded-full bg-primary"
									style={{ width: `${book.percent ?? 0}%` }}
								/>
							</div>
							<div className="mt-1 text-[11px] text-muted-foreground tabular-nums">
								{book.detail}
							</div>
						</div>
					</motion.button>
				))}
			</div>
		</motion.section>
	);
}
