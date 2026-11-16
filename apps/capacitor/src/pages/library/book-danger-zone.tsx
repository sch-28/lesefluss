import { RotateCcw, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { queryHooks } from "../../services/db/hooks";
import { queries } from "../../services/db/queries";
import type { Book } from "../../services/db/schema";
import { DangerRow, DangerZone } from "../_shared/danger-zone";
import { useSessionDelete } from "./stats/session-list";
import { filterSessions, shortSessionsOf } from "./stats/sessions-model";

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
		<DangerZone className="mt-4">
			{hasProgress && (
				<DangerRow icon={RotateCcw} onClick={onResetProgress}>
					Reset progress
				</DangerRow>
			)}
			{rows.length > 0 && (
				<DangerRow
					icon={Trash2}
					onClick={() =>
						requestDelete(rows, {
							confirm: true,
							alongside: shortSessionsOf(sessionsQuery.data ?? [], book.id, hidden),
						})
					}
				>
					Delete reading history
				</DangerRow>
			)}
			<DangerRow icon={Trash2} onClick={onDeleteBook}>
				Delete book
			</DangerRow>
			{dialog}
		</DangerZone>
	);
}
