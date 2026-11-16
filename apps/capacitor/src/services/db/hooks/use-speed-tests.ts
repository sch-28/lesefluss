import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scheduleSyncPush } from "../../sync";
import { queries } from "../queries";
import type { SpeedTestInput } from "../queries/speed-tests";
import { statsKeys } from "./query-keys";

/** Newest first. */
function useSpeedTests() {
	return useQuery({ queryKey: statsKeys.speedTests, queryFn: () => queries.getSpeedTests() });
}

function useSaveSpeedTest() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: SpeedTestInput) => queries.addSpeedTest(input),
		onSuccess: () => {
			scheduleSyncPush();
			return qc.invalidateQueries({ queryKey: statsKeys.all });
		},
	});
}

export const speedTestHooks = { useSpeedTests, useSaveSpeedTest };
