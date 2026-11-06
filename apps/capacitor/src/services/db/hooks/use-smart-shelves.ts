import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
import { smartShelfKeys } from "./query-keys";

function useSmartShelfRows() {
	return useQuery({ queryKey: smartShelfKeys.all, queryFn: () => queries.getSmartShelves() });
}

function useShelfMutation<T, R>(mutationFn: (vars: T) => Promise<R>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: () => {
			scheduleSyncPush();
			return qc.invalidateQueries({ queryKey: smartShelfKeys.all });
		},
	});
}

function useCreateSmartShelf() {
	return useShelfMutation((vars: { name: string; conditions: string; pinned: boolean }) =>
		queries.createSmartShelf(vars),
	);
}

function useUpdateSmartShelf() {
	return useShelfMutation(
		(vars: { id: string; name?: string; conditions?: string; pinned?: boolean }) => {
			const { id, ...patch } = vars;
			return queries.updateSmartShelf(id, patch);
		},
	);
}

function useDeleteSmartShelf() {
	return useShelfMutation((id: string) => queries.deleteSmartShelf(id));
}

export const smartShelfHooks = {
	useSmartShelfRows,
	useCreateSmartShelf,
	useUpdateSmartShelf,
	useDeleteSmartShelf,
};
