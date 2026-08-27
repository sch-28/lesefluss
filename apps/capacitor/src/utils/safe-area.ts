/**
 * Reads both safe-area sources so they can be compared on a real device.
 *
 * Capacitor's SystemBars plugin injects `--safe-area-inset-*` from
 * `WindowInsets` because some WebViews report `env(safe-area-inset-*)` as 0
 * under forced edge-to-edge. When a device shows overlapping system bars, the
 * two values tell apart a WebView bug (env 0, variable correct) from insets
 * never reaching Capacitor at all (both 0).
 */
export type SafeAreaProbe = {
	envTop: string;
	envBottom: string;
	varTop: string;
	varBottom: string;
};

const UNAVAILABLE: SafeAreaProbe = {
	envTop: "n/a",
	envBottom: "n/a",
	varTop: "n/a",
	varBottom: "n/a",
};

export function probeSafeArea(): SafeAreaProbe {
	if (typeof document === "undefined") return UNAVAILABLE;

	// One element carries env() on its padding and the injected variable on its
	// margin, so a single getComputedStyle resolves both to pixels.
	const probe = document.createElement("div");
	probe.style.cssText = [
		"position:fixed",
		"top:0",
		"left:0",
		"width:0",
		"height:0",
		"visibility:hidden",
		"pointer-events:none",
		"padding-top:env(safe-area-inset-top, 0px)",
		"padding-bottom:env(safe-area-inset-bottom, 0px)",
		"margin-top:var(--safe-area-inset-top, 0px)",
		"margin-bottom:var(--safe-area-inset-bottom, 0px)",
	].join(";");

	document.body.appendChild(probe);
	try {
		const style = getComputedStyle(probe);
		return {
			envTop: style.paddingTop,
			envBottom: style.paddingBottom,
			varTop: style.marginTop,
			varBottom: style.marginBottom,
		};
	} finally {
		probe.remove();
	}
}
