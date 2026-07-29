import { queryHooks } from "../../../services/db/hooks";
import { BookShelf } from "./book-shelf";

/** Books that crossed the finished threshold, newest first. */
export function FinishedShelf() {
	const finished = queryHooks.useStatsFinishedBooks();
	// The total, not the row count: the shelf is capped, so counting the rows
	// would freeze the subtitle at the cap forever.
	const total = finished.data?.total ?? 0;
	return (
		<BookShelf
			title="Finished"
			subtitle={total > 0 ? `${total} ${total === 1 ? "book" : "books"} · newest first` : "all time"}
			books={finished.data?.books ?? []}
			isPending={finished.isPending}
			emptyMessage="No finished books yet."
		/>
	);
}
