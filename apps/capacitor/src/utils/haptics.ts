import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { log } from "./log";

export async function hapticTick(enabled: boolean, style: ImpactStyle = ImpactStyle.Light) {
	if (!enabled) return;
	try {
		await Haptics.impact({ style });
	} catch (err) {
		// Web / unsupported platforms throw - log so real failures don't stay hidden.
		log.warn("haptics", "impact failed:", err);
	}
}

export { ImpactStyle };
