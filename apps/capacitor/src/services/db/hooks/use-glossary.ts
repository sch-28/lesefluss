import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
import { bookKeys, glossaryKeys } from "./query-keys";

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Glossary entries visible from inside a book — both book-scoped and global.
 * Enabled only when bookId is non-empty.
 */
function useGlossary(bookId: string) {
	return useQuery({
		queryKey: bookKeys.glossary(bookId),
		queryFn: () => queries.getEntriesForBook(bookId),
		enabled: !!bookId,
	});
}

// ─── Mutations ───────────────────────────────────────────────────────────────

function useAddGlossaryEntry() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: queries.addEntry,
		onSuccess: () => {
			// A new entry can affect any book view (esp. global entries), so invalidate broadly
			qc.invalidateQueries({ queryKey: glossaryKeys.all });
			qc.invalidateQueries({ queryKey: ["books"] });
			scheduleSyncPush();
		},
	});
}

function useUpdateGlossaryEntry() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (vars: { id: string; data: Parameters<typeof queries.updateEntry>[1] }) =>
			queries.updateEntry(vars.id, vars.data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: glossaryKeys.all });
			qc.invalidateQueries({ queryKey: ["books"] });
			scheduleSyncPush();
		},
	});
}

function useDeleteGlossaryEntry() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id }: { id: string }) => queries.deleteEntry(id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: glossaryKeys.all });
			qc.invalidateQueries({ queryKey: ["books"] });
			scheduleSyncPush();
		},
	});
}

// ─── Exported object ─────────────────────────────────────────────────────────

export const glossaryHooks = {
	useGlossary,
	useAddGlossaryEntry,
	useUpdateGlossaryEntry,
	useDeleteGlossaryEntry,
};
