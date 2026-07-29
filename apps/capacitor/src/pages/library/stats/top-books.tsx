import { queryHooks } from "../../../services/db/hooks";
import type { ShelfBook, TopBook } from "../../../services/db/queries/stats";
import { formatDuration } from "../../../utils/date-utils";
import { readingProgress } from "../../../utils/reading-progress";
import { estimatePages } from "../../../utils/reading-time";
import { BookShelf } from "./book-shelf";

interface Props {
	since: number;
	periodLabel: string;
}

/**
 * One line of context under the card. Both figures describe the book, not the
 * selected period: the badge over the cover already carries the period's time,
 * and a figure that changed meaning with a tab elsewhere on the page read as if
 * it described the book.
 */
function describeWork(book: TopBook): string {
	if (book.wordCount <= 0) return "";
	return `${estimatePages(book.wordCount)} pages · ${readingProgress(book)}% read`;
}

export function TopBooks({ since, periodLabel }: Props) {
	const top = queryHooks.useStatsTopBooks(since, 5);

	const books: ShelfBook[] = (top.data ?? []).map((book) => ({
		id: book.workId,
		title: book.title,
		author: book.author,
		coverImage: book.coverImage,
		detail: describeWork(book),
		// A rolled-up serial lives on the series route; only standalone books are
		// books. Dropping this branch sent every serial to "Book not found".
		href: book.isSeries
			? `/tabs/library/series/${book.workId}`
			: `/tabs/library/book/${book.workId}`,
	}));

	return (
		<BookShelf
			title="Most read"
			subtitle={`${periodLabel} · by time read`}
			books={books}
			isPending={top.isPending}
			emptyMessage="Nothing read in this period."
			badgeFor={(_book, index) => (
				<>
					<div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_top_left,rgba(0,0,0,0.7),transparent_70%)]" />
					<span className="absolute top-1 left-2 font-black text-[56px] text-white leading-none mix-blend-overlay drop-shadow-md">
						{index + 1}
					</span>
					<div className="absolute right-2 bottom-1.5 rounded-full bg-black/60 px-2 py-0.5 font-medium text-[10px] text-white tabular-nums backdrop-blur">
						{formatDuration(top.data?.[index]?.durationMs ?? 0)}
					</div>
				</>
			)}
		/>
	);
}
