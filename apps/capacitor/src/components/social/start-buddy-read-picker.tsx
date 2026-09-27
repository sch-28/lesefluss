import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@lesefluss/ui/drawer";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import CoverImage from "@/components/cover-image";
import {
	BUDDY_READ_BLOCKER_TEXT,
	StartBuddyReadSheet,
	shareBlockerFor,
} from "@/pages/library/book-buddy-read";
import { queryHooks } from "@/services/db/hooks";
import { syncKeys } from "@/services/db/hooks/query-keys";
import type { Book } from "@/services/db/schema";
import { useBuddyReads } from "@/services/social/buddy-reads";
import { getServerContentIds } from "@/services/sync/server-content-cache";
import { useLocalCover } from "./social-ui";

function PickerCover({ bookId }: { bookId: string }) {
	return <CoverImage src={useLocalCover(bookId)} alt="" />;
}

/** Picks a library book, then hands over to the same start sheet the book page uses. */
export function StartBuddyReadPicker({
	isOpen,
	onClose,
}: {
	isOpen: boolean;
	onClose: () => void;
}) {
	const { data: library } = queryHooks.useBooks();
	const reads = useBuddyReads();
	const [picked, setPicked] = useState<Book | null>(null);
	const { data: serverContentIds } = useQuery({
		queryKey: syncKeys.serverContentIds,
		queryFn: getServerContentIds,
		enabled: picked !== null,
		staleTime: 0,
	});

	const running = new Set(
		(reads.data ?? []).filter((r) => r.status === "in_progress").map((r) => r.originKey),
	);
	const books = (library?.books ?? []).filter((b) => !b.originKey || !running.has(b.originKey));
	const blocker = picked ? shareBlockerFor(picked, serverContentIds) : null;

	return (
		<>
			<Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Which book?</DrawerTitle>
					</DrawerHeader>
					<div className="max-h-[60vh] overflow-y-auto px-4 pb-6">
						{books.length === 0 ? (
							<p className="m-0 py-6 text-center text-muted-foreground text-sm">
								Add a book to your library first.
							</p>
						) : (
							<div className="flex flex-col gap-1">
								{books.map((book) => (
									<button
										key={book.id}
										type="button"
										onClick={() => {
											onClose();
											setPicked(book);
										}}
										className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/60"
									>
										<div className="relative aspect-[2/3] w-9 shrink-0 overflow-hidden rounded bg-muted">
											<PickerCover bookId={book.id} />
										</div>
										<div className="min-w-0 flex-1">
											<div className="truncate font-medium text-foreground text-sm">
												{book.title}
											</div>
											{book.author && (
												<div className="truncate text-muted-foreground text-xs">{book.author}</div>
											)}
										</div>
									</button>
								))}
							</div>
						)}
					</div>
				</DrawerContent>
			</Drawer>
			{picked && (
				<StartBuddyReadSheet
					isOpen
					onClose={() => setPicked(null)}
					isLoggedIn
					bookId={picked.id}
					bookTitle={picked.title}
					blocker={blocker ? BUDDY_READ_BLOCKER_TEXT[blocker] : null}
				/>
			)}
		</>
	);
}
