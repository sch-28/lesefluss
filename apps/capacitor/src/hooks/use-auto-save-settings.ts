import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { queryHooks, settingsKeys } from "../services/db/hooks";
import type { Settings } from "../services/db/schema";

export function useAutoSaveSettings() {
	const queryClient = useQueryClient();
	const { data: settings, isPending } = queryHooks.useSettings();
	const { mutate, mutateAsync } = queryHooks.useSaveSettings();

	const pendingRef = useRef<Partial<Omit<Settings, "id" | "updatedAt">>>({});
	const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

	const flush = useCallback(async () => {
		clearTimeout(timerRef.current);
		if (Object.keys(pendingRef.current).length === 0) return;
		const patch = { ...pendingRef.current };
		pendingRef.current = {};
		await mutateAsync(patch);
	}, [mutateAsync]);

	// Persist pending changes on unmount (fire-and-forget to avoid unmount errors)
	useEffect(() => {
		return () => {
			clearTimeout(timerRef.current);
			if (Object.keys(pendingRef.current).length > 0) {
				const patch = { ...pendingRef.current };
				pendingRef.current = {};
				mutate(patch);
			}
		};
	}, [mutate]);

	const updateSetting = useCallback(
		<K extends keyof Omit<Settings, "id" | "updatedAt">>(key: K, value: Settings[K]) => {
			// Optimistic cache update for instant UI feedback
			queryClient.setQueryData(settingsKeys.all, (old: Settings | undefined) =>
				old ? { ...old, [key]: value } : old,
			);

			// Accumulate into pending patch
			pendingRef.current = { ...pendingRef.current, [key]: value };

			// Debounce the actual DB write
			clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => {
				const patch = { ...pendingRef.current };
				pendingRef.current = {};
				mutate(patch);
			}, 300);
		},
		[queryClient, mutate],
	);

	/** Bulk-replace settings and persist immediately (e.g. loading from BLE device). */
	const replaceAll = useCallback(
		async (patch: Partial<Omit<Settings, "id" | "updatedAt">>) => {
			clearTimeout(timerRef.current);
			pendingRef.current = {};
			queryClient.setQueryData(settingsKeys.all, (old: Settings | undefined) =>
				old ? { ...old, ...patch } : old,
			);
			await mutateAsync(patch);
		},
		[queryClient, mutateAsync],
	);

	return { settings, updateSetting, flush, replaceAll, isPending };
}
