import { parse } from "acorn";
import { describe, expect, it, vi } from "vitest";
import {
	ENGINE_UNSUPPORTED_CLASS,
	ENGINE_VERSION_ATTR,
	engineCheckScript,
} from "../engine-support";

const OLD_CHROME_UA =
	"Mozilla/5.0 (Linux; Android 8.1.0; Likebook Mars Build/OPM2) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/83.0.4103.106 Mobile Safari/537.36";
const OLD_FIREFOX_UA = "Mozilla/5.0 (X11; Linux x86_64; rv:115.0) Gecko/20100101 Firefox/115.0";

type Engine = {
	supports?: (prop: string, value: string) => boolean;
	hasRegisterProperty?: boolean;
	userAgent?: string;
	readyState?: "loading" | "complete";
};

/** Runs the script against stand-in globals describing one engine. */
function run(script: string, engine: Engine) {
	const listeners: Record<string, () => void> = {};
	const versionEls = [{ textContent: "" }, { textContent: "" }];
	const html = { className: "light" };
	const document = {
		documentElement: html,
		readyState: engine.readyState ?? "loading",
		addEventListener: (type: string, fn: () => void) => {
			listeners[type] = fn;
		},
		querySelectorAll: (selector: string) =>
			selector === `[${ENGINE_VERSION_ATTR}]` ? versionEls : [],
	};
	const sent: { url: string; body: unknown }[] = [];
	class XMLHttpRequest {
		url = "";
		open(_method: string, url: string) {
			this.url = url;
		}
		setRequestHeader() {}
		send(body: string) {
			sent.push({ url: this.url, body: JSON.parse(body) });
		}
	}
	const nativePromise = vi.fn(() => Promise.resolve());
	const css = engine.supports
		? {
				supports: engine.supports,
				registerProperty: engine.hasRegisterProperty === false ? undefined : () => {},
			}
		: undefined;
	const windowListeners: Record<string, () => void> = {};
	const timers: (() => void)[] = [];
	const window = {
		CSS: css,
		Capacitor: { nativePromise },
		addEventListener: (type: string, fn: () => void) => {
			windowListeners[type] = fn;
		},
	};
	new Function("window", "document", "navigator", "XMLHttpRequest", "setTimeout", script)(
		window,
		document,
		{ userAgent: engine.userAgent ?? OLD_CHROME_UA },
		XMLHttpRequest,
		(fn: () => void) => timers.push(fn),
	);
	listeners.DOMContentLoaded?.();
	windowListeners.load?.();
	for (const fn of timers) fn();
	return { html, versionEls, sent, nativePromise };
}

const noOklch = (_prop: string, value: string) => !value.startsWith("oklch");

describe("engineCheckScript", () => {
	const script = engineCheckScript({
		telemetryUrl: "https://lesefluss.app/api/telemetry",
		platform: "android",
		shouldHideSplash: true,
	});

	it("parses as ES5, so engines without arrows or template literals can run it", () => {
		expect(() => parse(script, { ecmaVersion: 5 })).not.toThrow();
	});

	it("marks an engine without oklch, shows the version found, reports it and hides the splash", () => {
		const { html, versionEls, sent, nativePromise } = run(script, { supports: noOklch });
		expect(html.className.split(" ")).toContain(ENGINE_UNSUPPORTED_CLASS);
		expect(versionEls.map((el) => el.textContent)).toEqual(["83", "83"]);
		expect(sent).toEqual([
			{
				url: "https://lesefluss.app/api/telemetry",
				body: { type: "webview_unsupported", webview: "83", platform: "android" },
			},
		]);
		expect(nativePromise).toHaveBeenCalledWith("SplashScreen", "hide", {});
		expect(nativePromise).toHaveBeenCalledTimes(2);
	});

	it("fills the version at once when the page has already loaded", () => {
		const { versionEls } = run(script, { supports: noOklch, readyState: "complete" });
		expect(versionEls.map((el) => el.textContent)).toEqual(["83", "83"]);
	});

	it("treats an engine without CSS.supports or without @property as unsupported", () => {
		expect(run(script, {}).html.className).toContain(ENGINE_UNSUPPORTED_CLASS);
		expect(
			run(script, { supports: () => true, hasRegisterProperty: false }).html.className,
		).toContain(ENGINE_UNSUPPORTED_CLASS);
	});

	it("leaves the page alone when supports() throws, rather than breaking it", () => {
		const { html, sent } = run(script, {
			supports: () => {
				throw new SyntaxError("unknown");
			},
		});
		expect(html.className).toBe("light");
		expect(sent).toEqual([]);
	});

	it("reports an unknown version for a browser that is not Chromium", () => {
		const { versionEls } = run(script, { supports: noOklch, userAgent: OLD_FIREFOX_UA });
		expect(versionEls[0].textContent).toBe("unknown");
	});

	it("changes nothing on a supported engine", () => {
		const supports = vi.fn(() => true);
		const { html, versionEls, sent, nativePromise } = run(script, { supports });
		expect(html.className).toBe("light");
		expect(versionEls.map((el) => el.textContent)).toEqual(["", ""]);
		expect(sent).toEqual([]);
		expect(nativePromise).not.toHaveBeenCalled();
		expect(supports).toHaveBeenCalled();
	});

	it("sends nothing and leaves the splash alone without those options", () => {
		const { sent, nativePromise } = run(engineCheckScript({ platform: "web" }), {
			supports: () => false,
		});
		expect(sent).toEqual([]);
		expect(nativePromise).not.toHaveBeenCalled();
	});
});
