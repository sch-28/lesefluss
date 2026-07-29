import { queryHooks } from "../../../services/db/hooks";
import { BookShelf } from "./book-shelf";

/** What the reader is in the middle of. Disjoint from the finished shelf by
 *  construction, which is why both earn a place. */
export function CurrentlyReadingShelf() {
	const books = queryHooks.useStatsCurrentlyReading();
	return (
		<BookShelf
			title="Currently reading"
			subtitle="in progress · most recent first"
			books={books.data ?? []}
			isPending={books.isPending}
			emptyMessage="Nothing in progress. Open a book to start."
		/>
	);
}
