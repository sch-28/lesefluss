import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../../components/toast";
import { deleteServerSession, scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
import { readingSessionKeys, statsKeys } from "./query-keys";

function useAllReadingSessions() {
	return useQuery({
		queryKey: readingSessionKeys.all,
		queryFn: () => queries.getAllReadingSessions(),
	});
}

function useReadingSessionsByBook(bookId: string) {
	return useQuery({
		queryKey: readingSessionKeys.byBook(bookId),
		queryFn: () => queries.getReadingSessionsByBook(bookId),
		enabled: !!bookId,
	});
}

/**
 * Delete a single reading session locally + on the server. Sessions have no
 * tombstone column so a plain `scheduleSyncPush` would not propagate the
 * deletion; the dedicated server endpoint removes the row before the local
 * delete runs. If the server call fails (offline, etc.) the local row stays
 * and the user is shown a toast.
 */
function useDeleteReadingSession() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (id: string) => {
			await deleteServerSession(id);
			await queries.deleteReadingSession(id);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: readingSessionKeys.all });
			qc.invalidateQueries({ queryKey: statsKeys.all });
			scheduleSyncPush();
		},
		onError: () => {
			toast.error("Couldn't delete session. Check your connection and try again.");
		},
	});
}

export const readingSessionHooks = {
	useAllReadingSessions,
	useReadingSessionsByBook,
	useDeleteReadingSession,
};
