import { PUSH_API, type PushPreferences, type PushPreferencesPatch } from "@lesefluss/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authedFetch } from "../authed-fetch";
import { socialKeys } from "../db/hooks/query-keys";
import { socialQueryDefaults } from "../social/cache";

async function fetchPushPreferences(): Promise<PushPreferences> {
	const res = await authedFetch(PUSH_API.preferences);
	return res.json();
}

async function savePushPreferences(patch: PushPreferencesPatch): Promise<PushPreferences> {
	const res = await authedFetch(PUSH_API.preferences, {
		method: "POST",
		body: JSON.stringify(patch),
	});
	return res.json();
}

export function usePushPreferences() {
	return useQuery({
		queryKey: socialKeys.pushPreferences,
		queryFn: fetchPushPreferences,
		...socialQueryDefaults,
	});
}

const UPDATE_KEY = ["push-preferences-update"] as const;

/**
 * Flips the toggle at once. A failure puts back only the keys it changed, so a
 * toggle saved meanwhile survives; the server's row is fetched once the last
 * pending change settles, so an older response never overwrites a newer flip.
 */
export function useUpdatePushPreferences() {
	const client = useQueryClient();
	return useMutation({
		mutationKey: UPDATE_KEY,
		mutationFn: savePushPreferences,
		onMutate: async (patch) => {
			await client.cancelQueries({ queryKey: socialKeys.pushPreferences });
			const previous = client.getQueryData<PushPreferences>(socialKeys.pushPreferences);
			if (previous) client.setQueryData(socialKeys.pushPreferences, { ...previous, ...patch });
			return { previous };
		},
		onError: (_err, patch, context) => {
			const { previous } = context ?? {};
			if (!previous) return;
			const reverted = Object.fromEntries(
				Object.keys(patch).map((key) => [key, previous[key as keyof PushPreferences]]),
			);
			client.setQueryData<PushPreferences>(socialKeys.pushPreferences, (current) =>
				current ? { ...current, ...reverted } : current,
			);
		},
		onSettled: () => {
			if (client.isMutating({ mutationKey: UPDATE_KEY }) === 1) {
				void client.invalidateQueries({ queryKey: socialKeys.pushPreferences });
			}
		},
	});
}
