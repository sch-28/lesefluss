import { useState } from "react";
import { SheetOrDialog } from "../../../components/sheet-or-dialog";
import { queryHooks } from "../../../services/db/hooks";
import type { Book } from "../../../services/db/schema";
import { goalCandidates } from "./goal-model";
import { GoalSheetFor } from "./goal-sheet-for";

/** Picks a book without a goal, then opens its goal setup in place. */
export function GoalBookPicker({
	isOpen,
	onClose,
	goalBookIds,
}: {
	isOpen: boolean;
	onClose: () => void;
	goalBookIds: string[];
}) {
	const { data: library } = queryHooks.useBooks();
	const [picked, setPicked] = useState<Book | null>(null);
	const candidates = goalCandidates(library?.books ?? [], goalBookIds);

	return (
		<>
			<SheetOrDialog
				open={isOpen}
				onOpenChange={(open) => {
					if (!open) onClose();
				}}
				title="Set a reading goal"
				drawerClassName="sm:mx-auto sm:max-w-lg"
			>
				{candidates.length > 0 && (
					<p className="m-0 px-4 pb-2 text-muted-foreground text-sm">
						A goal is for one book. Pick the book you want to finish.
					</p>
				)}
				<div className="flex flex-col divide-y divide-border overflow-y-auto px-4 pb-4">
					{candidates.map((book) => (
						<button
							key={book.id}
							type="button"
							data-testid="goal-candidate"
							className="flex min-h-14 cursor-pointer flex-col justify-center py-2 text-left"
							onClick={() => {
								onClose();
								setPicked(book);
							}}
						>
							<span className="truncate text-foreground text-sm">{book.title}</span>
							{book.author && (
								<span className="truncate text-muted-foreground text-xs">{book.author}</span>
							)}
						</button>
					))}
					{library && candidates.length === 0 && (
						<p
							className="m-0 py-3 text-muted-foreground text-sm"
							data-testid="goal-candidates-none"
						>
							No unfinished book is left without a goal. Add a book to your library to set one.
						</p>
					)}
				</div>
			</SheetOrDialog>
			{picked && (
				<GoalSheetFor book={picked} existing={null} isOpen onClose={() => setPicked(null)} />
			)}
		</>
	);
}
