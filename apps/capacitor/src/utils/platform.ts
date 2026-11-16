import { Capacitor } from "@capacitor/core";

/** True when running in a browser (not inside a native Capacitor WebView). */
export const IS_WEB = Capacitor.getPlatform() === "web";

/** True in the installed web app (Home Screen on iOS, an installed app on desktop or Android). */
export function isStandalone(): boolean {
	if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
	return (
		window.matchMedia?.("(display-mode: standalone), (display-mode: fullscreen)").matches ?? false
	);
}
