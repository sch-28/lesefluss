import { useState, useEffect } from "react";
import { useToast } from "../components/toast";
import { queryHooks } from "../services/db/hooks";
import type { Settings } from "../services/db/schema";
import { log } from "../utils/log";

export function useSettingsDraft() {
	const { showToast } = useToast();
	const { data: dbSettings, isPending } = queryHooks.useSettings();
	const saveMutation = queryHooks.useSaveSettings();

	const [draft, setDraft] = useState<Settings | null>(dbSettings ?? null);

	// Seed draft when DB data arrives (only if draft hasn't been set yet)
	useEffect(() => {
		if (dbSettings && !draft) {
			setDraft(dbSettings);
		}
	}, [dbSettings, draft]);

	const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
		if (!draft) return;
		setDraft((prev) => ({ ...prev!, [key]: value }));
	};

	const handleSave = async () => {
		if (!draft) return;
		try {
			const { id, updatedAt, ...settingsToSave } = draft;
			await saveMutation.mutateAsync(settingsToSave);
			showToast("Settings saved");
		} catch (error) {
			log.error("settings", "Failed to save settings:", error);
			showToast("Failed to save settings", "danger");
		}
	};

	return { draft, setDraft, updateSetting, handleSave, saveMutation, isPending };
}
