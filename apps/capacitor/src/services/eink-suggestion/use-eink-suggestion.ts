import { Tablet } from "lucide-react";
import { useEffect } from "react";
import { showPromptToast } from "@/components/prompt-toast";
import { toast } from "@/components/toast";
import { useTheme } from "@/contexts/theme-context";
import { queryHooks } from "../db/hooks";
import { getDeviceInfo, isEinkManufacturer } from "../device-info";
import { einkSuggestionFor } from "./decide";

const AUTO_APPLIED_KEY = "lesefluss:eink-auto-applied";
const DISMISSED_KEY = "lesefluss:eink-prompt-dismissed";

function readFlag(key: string): boolean {
	try {
		return localStorage.getItem(key) === "1";
	} catch {
		return false;
	}
}

function writeFlag(key: string): void {
	try {
		localStorage.setItem(key, "1");
	} catch {
		// Without storage the suggestion may repeat next launch; it never blocks the app.
	}
}

// Survives a transient root re-mount so one launch acts at most once.
let hasActed = false;

/** On a known e-reader, switches e-ink mode on for a fresh install or offers it once to an existing one. */
export function useEinkSuggestion(): void {
	const { data: settings } = queryHooks.useSettings();
	const { mutate: saveSettings } = queryHooks.useSaveSettings();
	const { isEinkMode } = useTheme();
	const isLoaded = settings !== undefined;
	const isOnboardingCompleted = settings?.onboardingCompleted ?? false;

	useEffect(() => {
		if (!isLoaded || hasActed) return;
		let isCancelled = false;
		void getDeviceInfo().then((info) => {
			if (isCancelled || hasActed || !info) return;
			const suggestion = einkSuggestionFor({
				isEinkDevice: isEinkManufacturer(info),
				isEinkMode,
				isOnboardingCompleted,
				wasAutoApplied: readFlag(AUTO_APPLIED_KEY),
				wasDismissed: readFlag(DISMISSED_KEY),
			});
			if (suggestion === "none") return;
			hasActed = true;
			if (suggestion === "auto-enable") {
				writeFlag(AUTO_APPLIED_KEY);
				saveSettings({ einkMode: true });
				toast.info("E-ink display turned on for this e-reader. You can change it in Settings.");
				return;
			}
			showPromptToast({
				icon: Tablet,
				title: "E-ink screen detected",
				body: "E-ink display mode removes animations and uses black on white. You can change it in Settings.",
				primaryLabel: "Turn on",
				secondaryLabel: "Not now",
				onPrimary: () => {
					writeFlag(DISMISSED_KEY);
					saveSettings({ einkMode: true });
				},
				onSecondary: () => writeFlag(DISMISSED_KEY),
			});
		});
		return () => {
			isCancelled = true;
		};
	}, [isLoaded, isEinkMode, isOnboardingCompleted, saveSettings]);
}
