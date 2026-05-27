import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { queryHooks, settingsKeys } from "../services/db/hooks";
import type { Settings } from "../services/db/schema";

export function useAutoSaveSettings() {
	const queryClient = useQueryClient();
	const { data: settings, isPending } = queryHooks.useSettings();
	const { mutateAsync } = queryHooks.useSaveSettings();

	// Track the latest in-flight write so `flush()` can wait for the actual
	// SQLite commit (onboarding "finish" + BLE settings sync need this).
	const lastWriteRef = useRef<Promise<unknown> | null>(null);

	const updateSetting = useCallback(
		<K extends keyof Omit<Settings, "id" | "updatedAt">>(key: K, value: Settings[K]) => {
			// Optimistic cache update for instant UI feedback.
			queryClient.setQueryData(settingsKeys.all, (old: Settings | undefined) =>
				old ? { ...old, [key]: value } : old,
			);
			// Write immediately. Single-row upsert in sql.js is sub-ms; the prior
			// 300ms debounce dropped settings when the form unmounted (route nav)
			// before the timer fired.
			lastWriteRef.current = mutateAsync({ [key]: value } as Partial<
				Omit<Settings, "id" | "updatedAt">
			>);
		},
		[queryClient, mutateAsync],
	);

	/** Block until the most recent `updateSetting` write has committed. */
	const flush = useCallback(async () => {
		if (lastWriteRef.current) await lastWriteRef.current;
	}, []);

	/** Bulk-replace settings and persist immediately (e.g. loading from BLE device). */
	const replaceAll = useCallback(
		async (patch: Partial<Omit<Settings, "id" | "updatedAt">>) => {
			queryClient.setQueryData(settingsKeys.all, (old: Settings | undefined) =>
				old ? { ...old, ...patch } : old,
			);
			lastWriteRef.current = mutateAsync(patch);
			await lastWriteRef.current;
		},
		[queryClient, mutateAsync],
	);

	return { settings, updateSetting, flush, replaceAll, isPending };
}
