import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queries } from "../queries";
import { bookKeys } from "./query-keys";

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * All highlights for a book, ordered by start_offset.
 * Enabled only when `bookId` is non-empty.
 */
function useHighlights(bookId: string) {
	return useQuery({
		queryKey: bookKeys.highlights(bookId),
		queryFn: () => queries.getHighlightsByBook(bookId),
		enabled: !!bookId,
	});
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function useAddHighlight() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: queries.addHighlight,
		onSuccess: (_data, highlight) => {
			qc.invalidateQueries({ queryKey: bookKeys.highlights(highlight.bookId) });
		},
	});
}

function useUpdateHighlight() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: {
			id: string;
			bookId: string;
			data: Parameters<typeof queries.updateHighlight>[1];
		}) => queries.updateHighlight(vars.id, vars.data),
		onSuccess: (_data, { bookId }) => {
			qc.invalidateQueries({ queryKey: bookKeys.highlights(bookId) });
		},
	});
}

function useDeleteHighlight() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id }: { id: string; bookId: string }) => queries.deleteHighlight(id),
		onSuccess: (_data, { bookId }) => {
			qc.invalidateQueries({ queryKey: bookKeys.highlights(bookId) });
		},
	});
}

// ─── Exported object ─────────────────────────────────────────────────────────

export const highlightHooks = {
	useHighlights,
	useAddHighlight,
	useUpdateHighlight,
	useDeleteHighlight,
};
