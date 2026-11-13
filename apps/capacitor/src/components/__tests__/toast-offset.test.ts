import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { measureToastLift, TOAST_CLEAR_ATTR, updateToastBottom } from "../toast-offset";

const VW = 390;
const VH = 844;

function bar(rect: { top: number; left: number; width: number; height: number }) {
	const el = document.createElement("div");
	el.setAttribute(TOAST_CLEAR_ATTR, "");
	el.getBoundingClientRect = () =>
		({
			...rect,
			right: rect.left + rect.width,
			bottom: rect.top + rect.height,
		}) as DOMRect;
	document.body.appendChild(el);
	return el;
}

beforeEach(() => {
	Object.defineProperty(window, "innerWidth", { value: VW, configurable: true });
	Object.defineProperty(window, "innerHeight", { value: VH, configurable: true });
});

afterEach(() => {
	document.body.innerHTML = "";
	document.documentElement.style.removeProperty("--toast-bottom");
});

describe("toast offset", () => {
	it("sits on the safe area when no bar is showing", () => {
		expect(measureToastLift()).toBe(0);
		updateToastBottom();
		expect(document.documentElement.style.getPropertyValue("--toast-bottom")).toContain(
			"--safe-bottom",
		);
	});

	it("clears the highest bar under the toast column", () => {
		bar({ top: VH - 56, left: 0, width: VW, height: 56 });
		bar({ top: VH - 56 - 72, left: VW - 72, width: 56, height: 56 });
		expect(measureToastLift()).toBe(128);
		updateToastBottom();
		expect(document.documentElement.style.getPropertyValue("--toast-bottom")).toBe("136px");
	});

	it("ignores headers, hidden bars and controls beside the column", () => {
		bar({ top: 0, left: 0, width: VW, height: 48 });
		bar({ top: VH - 56, left: 0, width: 0, height: 0 });
		bar({ top: VH - 60, left: 1000, width: 56, height: 56 });
		expect(measureToastLift()).toBe(0);
	});

	it("follows a bar that goes away", () => {
		const tabs = bar({ top: VH - 56, left: 0, width: VW, height: 56 });
		updateToastBottom();
		expect(document.documentElement.style.getPropertyValue("--toast-bottom")).toBe("64px");
		tabs.remove();
		updateToastBottom();
		expect(document.documentElement.style.getPropertyValue("--toast-bottom")).toContain(
			"--safe-bottom",
		);
	});
});
