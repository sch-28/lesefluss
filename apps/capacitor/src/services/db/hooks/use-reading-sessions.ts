import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "../../../components/toast";
import { deleteReadingSessionsEverywhere } from "../../sync";
import { queries } from "../queries";
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

export const readingSessionHooks = {
	useBookReadingSessions,
	useAllReadingSessions,
	useReadingSessionCount,
	useDeleteReadingSessions,
};
