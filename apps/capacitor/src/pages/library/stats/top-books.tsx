import { motion } from "framer-motion";
import { useHistory } from "react-router-dom";
import CoverImage from "../../../components/cover-image";
import { queryHooks } from "../../../services/db/hooks";

const MS_PER_DAY = 86_400_000;

interface Props {
	/** Page-level locked "now" so the query key stays stable across renders. */
	now: number;
}

export function TopBooks({ now }: Props) {
	const since = now - 30 * MS_PER_DAY;
	const top = queryHooks.useStatsTopBooks(since, 5);
	const history = useHistory();

	const books = top.data ?? [];
	if (books.length === 0) return null;

	return (
		<motion.section
			initial={{ opacity: 0, y: 12 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.25 }}
			transition={{ duration: 0.5 }}
			className="mb-10"
		>
			<header className="mb-3 px-4">
				<h2 className="font-semibold text-lg">Top books</h2>
				<p className="mt-0.5 text-[11px] uppercase tracking-wider opacity-60">
					This month · by time read
				</p>
			</header>
			<div className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2">
				{books.map((b, i) => {
					const minutes = Math.round(b.durationMs / 60_000);
					return (
						<motion.button
							type="button"
							key={b.bookId}
							onClick={() => history.push(`/tabs/library/book/${b.bookId}`)}
							initial={{ opacity: 0, x: 16 }}
							whileInView={{ opacity: 1, x: 0 }}
							viewport={{ once: true }}
							transition={{ duration: 0.4, delay: i * 0.06 }}
							whileTap={{ scale: 0.97 }}
							className="relative w-[140px] flex-shrink-0 snap-start border-0 bg-transparent p-0 text-left"
						>
							<div className="relative aspect-[2/3] overflow-hidden rounded-xl">
								<CoverImage src={b.coverImage} alt={b.title} />
								<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent" />
								<div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_top_left,rgba(0,0,0,0.7),transparent_70%)]" />
								<span className="absolute top-1 left-2 font-black text-[64px] text-white leading-none mix-blend-overlay drop-shadow-md">
									{i + 1}
								</span>
								<div className="absolute right-2 bottom-1.5 rounded-full bg-black/60 px-2 py-0.5 font-medium text-[10px] text-white tabular-nums backdrop-blur">
									{minutes}m
								</div>
							</div>
							<div className="mt-2 px-0.5 text-[color:var(--ion-text-color)]">
								<div className="line-clamp-1 font-medium text-sm">{b.title}</div>
								{b.author && (
									<div className="mt-0.5 line-clamp-1 text-[11px] opacity-60">{b.author}</div>
								)}
							</div>
						</motion.button>
					);
				})}
			</div>
		</motion.section>
	);
}
