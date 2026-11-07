import { afterEach, describe, expect, it, vi } from "vitest";
import { isPipSupported, openPipWindow } from "../open-pip-window";

function fakePip(previous: Window | null = null) {
	const pipDoc = document.implementation.createHTMLDocument("");
	const pip = { document: pipDoc, close: vi.fn() } as unknown as Window;
	const api = { window: previous, requestWindow: vi.fn(async () => pip) };
	Object.assign(window, { documentPictureInPicture: api });
	return { api, pip, pipDoc };
}

afterEach(() => {
	delete (window as { documentPictureInPicture?: unknown }).documentPictureInPicture;
	for (const s of document.head.querySelectorAll("style[data-test]")) s.remove();
	document.documentElement.className = "";
	document.body.className = "";
});

describe("openPipWindow", () => {
	it("is unsupported without the API", () => {
		expect(isPipSupported()).toBe(false);
	});

	it("opens at the size asked, titles the window and carries the styles and theme over", async () => {
		const style = document.createElement("style");
		style.dataset.test = "";
		style.textContent = ".strip { color: red; }";
		document.head.appendChild(style);
		document.documentElement.className = "dark";
		document.documentElement.style.fontSize = "18px";
		document.body.className = "dark";
		const { api, pip, pipDoc } = fakePip();

		expect(isPipSupported()).toBe(true);
		const opened = await openPipWindow({ width: 600, height: 120, title: "Lesefluss burst read" });

		expect(opened).toBe(pip);
		expect(api.requestWindow).toHaveBeenCalledWith({ width: 600, height: 120 });
		expect(pipDoc.title).toBe("Lesefluss burst read");
		expect(pipDoc.head.textContent).toContain(".strip");
		expect(pipDoc.documentElement.className).toBe("dark");
		expect(pipDoc.documentElement.getAttribute("style")).toContain("18px");
		expect(pipDoc.body.className).toBe("dark");
	});

	it("closes an open pop-up before opening the next", async () => {
		const previous = { close: vi.fn() } as unknown as Window;
		fakePip(previous);
		await openPipWindow({ width: 600, height: 120, title: "x" });
		expect(previous.close).toHaveBeenCalledTimes(1);
	});
});
