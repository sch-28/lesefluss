import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../../components/toast";
import { deleteReadingSessionsEverywhere, scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
import type { ReadingSessionEdit } from "../queries/reading-sessions";
import { readingSessionKeys, statsKeys } from "./query-keys";

function useBookReadingSessions(bookId: string) {
	return useQuery({
		queryKey: readingSessionKeys.book(bookId),
		queryFn: () => queries.getBookReadingSessions(bookId),
		enabled: bookId !== "",
	});
}

function useAllReadingSessions() {
	return useQuery({
		queryKey: readingSessionKeys.list,
		queryFn: () => queries.getAllReadingSessions(),
	});
}

function useReadingSessionCount(bookId?: string) {
	return useQuery({
		queryKey: readingSessionKeys.count(bookId),
		queryFn: () => queries.countReadingSessions(bookId),
	});
}

function useDeleteReadingSessions() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: deleteReadingSessionsEverywhere,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: readingSessionKeys.all });
			qc.invalidateQueries({ queryKey: statsKeys.all });
		},
		onError: () => {
			toast.error("Couldn't delete sessions. Check your connection and try again.");
		},
	});
}

function useUpdateReadingSession() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, edit }: { id: string; edit: ReadingSessionEdit }) =>
			queries.updateReadingSession(id, edit),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: readingSessionKeys.all });
			qc.invalidateQueries({ queryKey: statsKeys.all });
			scheduleSyncPush(2000);
		},
		onError: () => {
			toast.error("Couldn't save the session.");
		},
	});
}

export const readingSessionHooks = {
	useBookReadingSessions,
	useAllReadingSessions,
	useReadingSessionCount,
	useDeleteReadingSessions,
	useUpdateReadingSession,
};
