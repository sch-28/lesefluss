import type { ReportBody } from "@lesefluss/core";
import { SOCIAL_API } from "@lesefluss/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "../authed-fetch";
import { socialKeys } from "../db/hooks/query-keys";

export async function reportUser(body: ReportBody): Promise<{ id: string }> {
	const res = await authedFetch(SOCIAL_API.report, { method: "POST", body: JSON.stringify(body) });
	return res.json();
}

export function useReportUser() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: reportUser,
		onSuccess: (_result, body) => {
			// Blocking in the same request changes friend lists and hides the person.
			if (body.block) {
				void queryClient.invalidateQueries({ queryKey: socialKeys.relationships });
				void queryClient.invalidateQueries({ queryKey: socialKeys.all });
			}
		},
	});
}
