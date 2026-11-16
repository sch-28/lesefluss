import { Browser } from "@capacitor/browser";
import { IS_WEB, isStandalone } from "./platform";

function isOwnOrigin(url: string): boolean {
	try {
		return new URL(url, window.location.href).origin === window.location.origin;
	} catch {
		return false;
	}
}

/**
 * Opens a link the same way everywhere (LESE-20.3). Native keeps its browsers:
 * the in-app one, or the system one for `nativeTarget: "system"`. On the web, a
 * Lesefluss page replaces the installed app's window, which its scope "/" keeps
 * inside the app; everything else opens a new tab, which iOS standalone hands to
 * Safari and the desktop app to the browser.
 */
export function openLink(
	url: string,
	{ nativeTarget = "in-app" }: { nativeTarget?: "in-app" | "system" } = {},
): void {
	if (!IS_WEB) {
		if (nativeTarget === "system") window.open(url, "_system");
		else void Browser.open({ url });
		return;
	}
	if (isStandalone() && isOwnOrigin(url)) {
		window.location.assign(url);
		return;
	}
	window.open(url, "_blank", "noopener");
}
