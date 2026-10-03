import { ENGINE_UNSUPPORTED_CLASS } from "@lesefluss/core/engine-support";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { OldBrowserNotice, oldBrowserCheckScript } from "../old-browser-notice";

/** Server-render the notice, then run the head check as the browser would. */
function load(supportsModernColors: boolean) {
	document.documentElement.className = "";
	document.body.innerHTML = renderToString(<OldBrowserNotice />);
	// happy-dom hands out a fresh `window.CSS` per read, so a spy on one never sticks.
	Object.defineProperty(window, "CSS", {
		configurable: true,
		value: { supports: () => supportsModernColors, registerProperty: () => {} },
	});
	new Function(oldBrowserCheckScript.children)();
	document.dispatchEvent(new Event("DOMContentLoaded"));
	return document.getElementById("old-browser-notice") as HTMLElement;
}

const realCss = Object.getOwnPropertyDescriptor(window, "CSS");

afterEach(() => {
	if (realCss) Object.defineProperty(window, "CSS", realCss);
});

describe("OldBrowserNotice", () => {
	it("shows on a browser without oklch()", () => {
		const notice = load(false);
		expect(document.documentElement.classList).toContain(ENGINE_UNSUPPORTED_CLASS);
		expect(getComputedStyle(notice).display).toBe("block");
		expect(notice.textContent).toContain("Sign in with your phone");
	});

	it("stays hidden on a modern browser", () => {
		const notice = load(true);
		expect(getComputedStyle(notice).display).toBe("none");
	});
});
