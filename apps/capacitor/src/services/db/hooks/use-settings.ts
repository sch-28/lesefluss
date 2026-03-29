import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queries } from "../queries";
import type { Settings } from "../schema";
import { settingsKeys } from "./query-keys";

// ─── Query ────────────────────────────────────────────────────────────────────

/**
 * The single RSVP settings row.
 * Seeds defaults on first run (handled inside `queries.getSettings()`).
 */
function useSettings() {
	return useQuery({
		queryKey: settingsKeys.all,
		queryFn: queries.getSettings,
	});
}

// ─── Mutation ─────────────────────────────────────────────────────────────────

/**
 * Persist a partial settings update to SQLite.
 *
 * Usage:
 *   const save = queryHooks.useSaveSettings();
 *   save.mutate({ wpm: 400 });
 *   // or a full settings object (id + updatedAt stripped automatically):
 *   const { id, updatedAt, ...patch } = settings;
 *   save.mutate(patch);
 *
 * On success, invalidates `settingsKeys.all` so any component reading
 * `useSettings()` receives the updated values.
 */
function useSaveSettings() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (patch: Partial<Omit<Settings, "id" | "updatedAt">>) => queries.saveSettings(patch),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: settingsKeys.all });
		},
	});
}

// ─── Exported object ──────────────────────────────────────────────────────────

export const settingsHooks = {
	useSettings,
	useSaveSettings,
};
