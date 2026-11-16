import type { WordPosition } from "@lesefluss/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
import { bookKeys } from "./query-keys";

function useBookmarks(bookId: string) {
	return useQuery({
		queryKey: bookKeys.bookmarks(bookId),
		queryFn: () => queries.getBookmarksByBook(bookId),
		enabled: !!bookId,
	});
}

function useBookmarkMutation<T extends { bookId: string }, R>(mutationFn: (vars: T) => Promise<R>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: (_data, { bookId }) => {
			scheduleSyncPush();
			return qc.invalidateQueries({ queryKey: bookKeys.bookmarks(bookId) });
		},
	});
}

function useAddBookmark() {
	return useBookmarkMutation(
		(vars: { bookId: string; word: WordPosition; label?: string | null }) =>
			queries.addBookmark(vars),
	);
}

function useToggleBookmark() {
	return useBookmarkMutation((vars: { bookId: string; from: WordPosition; to: WordPosition }) =>
		queries.toggleBookmarkOnScreen(vars.bookId, vars.from, vars.to),
	);
}

function useRenameBookmark() {
	return useBookmarkMutation((vars: { id: string; bookId: string; label: string | null }) =>
		queries.renameBookmark(vars.id, vars.label),
	);
}

function useDeleteBookmark() {
	return useBookmarkMutation((vars: { id: string; bookId: string }) =>
		queries.deleteBookmark(vars.id),
	);
}

export const bookmarkHooks = {
	useBookmarks,
	useAddBookmark,
	useToggleBookmark,
	useRenameBookmark,
	useDeleteBookmark,
};
