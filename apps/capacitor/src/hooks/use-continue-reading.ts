import { useRouter } from "@tanstack/react-router";
import { queryHooks } from "../services/db/hooks";
import type { Book } from "../services/db/schema";

/** The book read last and how to open it at its saved word; null before any reading. */
export function useContinueReading(): { book: Book; open: () => void } | null {
	const router = useRouter();
	const { data: bookId } = queryHooks.useLastReadBookId();
	const { data: book } = queryHooks.useBook(bookId ?? "");
	if (!bookId || !book || book.deleted) return null;
	return {
		book,
		open: () => {
			void router.navigate({ to: "/tabs/reader/$id", params: { id: book.id } });
		},
	};
}
