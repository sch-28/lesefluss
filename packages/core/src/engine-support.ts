/** Oldest Chromium the app's CSS renders on: Tailwind v4 needs oklch() and color-mix(). */
export const MIN_CHROMIUM = 111;

export const ENGINE_UNSUPPORTED_CLASS = "engine-unsupported";

/** Elements whose text becomes the engine version found. */
export const ENGINE_VERSION_ATTR = "data-engine-version";

type EngineCheckOptions = {
	/** Where a `webview_unsupported` event is posted on each load; omitted, nothing is sent. */
	telemetryUrl?: string;
	platform: string;
	/** In the Capacitor app nothing else hides the splash screen when the app does not start. */
	shouldHideSplash?: boolean;
};

/**
 * Source of a classic inline script that marks <html> with ENGINE_UNSUPPORTED_CLASS
 * on an engine too old for the app's CSS.
 *
 * Contract: ES5 only and no dependencies, because it must run on engines far
 * older than anything supported. Features decide, not the user agent, since
 * forks report versions they do not match. `registerProperty` stands for
 * @property, which Tailwind also needs (Firefox before 128 has the colours).
 */
export function engineCheckScript({
	telemetryUrl,
	platform,
	shouldHideSplash,
}: EngineCheckOptions): string {
	return `(function () {
	try {
		var css = window.CSS;
		var ok = !!(css && css.supports && css.registerProperty &&
			css.supports("color", "oklch(0 0 0)") &&
			css.supports("color", "color-mix(in srgb, red, red)"));
		if (ok) return;
		var html = document.documentElement;
		if ((" " + html.className + " ").indexOf(${JSON.stringify(` ${ENGINE_UNSUPPORTED_CLASS} `)}) < 0) {
			html.className += ${JSON.stringify(` ${ENGINE_UNSUPPORTED_CLASS}`)};
		}
		var match = /Chrome\\/(\\d+)/.exec(navigator.userAgent);
		var version = match ? match[1] : "unknown";
		var onReady = function () {
			var els = document.querySelectorAll(${JSON.stringify(`[${ENGINE_VERSION_ATTR}]`)});
			for (var i = 0; i < els.length; i++) els[i].textContent = version;
		};
		if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onReady);
		else onReady();
		if (${shouldHideSplash ? "true" : "false"}) {
			// On a Boox a hide at DOMContentLoaded left the splash up; these later ones work.
			var hideSplash = function () {
				var cap = window.Capacitor;
				if (cap && cap.nativePromise) cap.nativePromise("SplashScreen", "hide", {})["catch"](function () {});
			};
			window.addEventListener("load", hideSplash);
			setTimeout(hideSplash, 1000);
		}
		var url = ${JSON.stringify(telemetryUrl ?? "")};
		if (url) {
			var xhr = new XMLHttpRequest();
			xhr.open("POST", url);
			xhr.setRequestHeader("Content-Type", "application/json");
			xhr.send(JSON.stringify({ type: "webview_unsupported", webview: version, platform: ${JSON.stringify(platform)} }));
		}
	} catch (e) {}
})();`;
}
