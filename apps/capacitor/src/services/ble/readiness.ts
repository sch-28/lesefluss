export type ScanBlocker = "bluetooth-off" | "location-off" | "permission-denied";

export interface RadioApi {
	isEnabled(): Promise<boolean>;
	requestEnable(): Promise<void>;
	isLocationEnabled(): Promise<boolean>;
}

interface ReadinessOptions {
	isAndroid: boolean;
	/** Only a user action may open the system enable-Bluetooth dialog; auto-scan must not. */
	interactive: boolean;
}

export async function checkScanReadiness(
	api: RadioApi,
	{ isAndroid, interactive }: ReadinessOptions,
): Promise<ScanBlocker | null> {
	if (!(await api.isEnabled())) {
		if (!isAndroid || !interactive) return "bluetooth-off";
		try {
			await api.requestEnable();
		} catch {
			return "bluetooth-off";
		}
	}
	// Without the neverForLocation manifest flag, Android filters out every
	// scan result while location services are off, on all API levels.
	if (isAndroid && !(await api.isLocationEnabled())) return "location-off";
	return null;
}

/** Android rejects with "Permission denied.", iOS with "BLE permission denied". */
export function isPermissionDeniedError(message: string | undefined): boolean {
	return message !== undefined && /permission denied/i.test(message);
}

export const SCAN_BLOCKER_MESSAGES: Record<ScanBlocker, string> = {
	"bluetooth-off": "Bluetooth is turned off. Turn it on to find your device.",
	"location-off": "Location is turned off. Android needs it on to scan for Bluetooth devices.",
	"permission-denied": "Bluetooth permission was denied. Allow it in the app settings.",
};
