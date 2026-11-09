import { Button } from "@lesefluss/ui/button";
import { RotateCcw, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { queryHooks } from "../../services/db/hooks";
import { queries } from "../../services/db/queries";
import type { Book } from "../../services/db/schema";
import { useSessionDelete } from "./stats/session-list";
import { filterSessions, shortSessionsOf } from "./stats/sessions-model";

const DANGER_BUTTON = "justify-start gap-3 text-destructive hover:text-destructive";

/** The book page's destructive actions, apart from everything a reader taps while reading. */
export function BookDangerZone({
	book,
	onResetProgress,
	onDeleteBook,
}: {
	book: Book;
	onResetProgress: () => void;
	onDeleteBook: () => void;
}) {
	const sessionsQuery = queryHooks.useBookReadingSessions(book.id);
	const books = useMemo(() => new Map([[book.id, book]]), [book]);
	const { hidden, requestDelete, dialog } = useSessionDelete({
		books,
		streakRows: () => queries.getAllReadingSessions(),
		onStart: () => {},
	});
	const rows = useMemo(
		() => filterSessions(sessionsQuery.data ?? [], { mode: "all", hidden }),
		[sessionsQuery.data, hidden],
	);
	const hasProgress = book.wordPosition > 0 || book.finishedAt !== null;

	return (
		<section aria-labelledby="book-danger-zone" className="book-detail-card mt-4">
			<h2 id="book-danger-zone" className="book-detail-section-title">
				Danger zone
			</h2>
			<div className="flex flex-col gap-2">
				{hasProgress && (
					<Button variant="outline" size="lg" className={DANGER_BUTTON} onClick={onResetProgress}>
						<RotateCcw />
						Reset progress
					</Button>
				)}
				{rows.length > 0 && (
					<Button
						variant="outline"
						size="lg"
						className={DANGER_BUTTON}
						onClick={() =>
							requestDelete(rows, {
								confirm: true,
								alongside: shortSessionsOf(sessionsQuery.data ?? [], book.id, hidden),
							})
						}
					>
						<Trash2 />
						Delete all {rows.length} {rows.length === 1 ? "session" : "sessions"}
					</Button>
				)}
				<Button variant="outline" size="lg" className={DANGER_BUTTON} onClick={onDeleteBook}>
					<Trash2 />
					Delete book
				</Button>
			</div>
			{dialog}
		</section>
	);
}
