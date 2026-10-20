import { useQuery } from "@tanstack/react-query";
import { IS_READ_ALOUD_SUPPORTED, ttsEngine } from "./index";

const ttsVoicesKey = ["tts-voices"] as const;

/** The speech engine's voices. Refetched on focus, since voices get installed in system settings. */
export function useTtsVoices(isEnabled = true) {
	return useQuery({
		queryKey: ttsVoicesKey,
		queryFn: async () => (await ttsEngine.getVoices()).voices,
		enabled: isEnabled && IS_READ_ALOUD_SUPPORTED,
		staleTime: 60_000,
		refetchOnWindowFocus: true,
	});
}
