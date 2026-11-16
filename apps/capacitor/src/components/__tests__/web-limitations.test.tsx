import { afterEach, describe, expect, it, vi } from "vitest";
import { click, type Rendered, render } from "../../test/render";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<object>()),
	useNavigate: () => navigate,
}));
vi.mock("@/services/tts", () => ({ IS_READ_ALOUD_SUPPORTED: true }));
const openLink = vi.hoisted(() => vi.fn());
vi.mock("@/utils/open-link", () => ({ openLink }));

const { OnTheWebCard, WebLimitsLine, keepInView } = await import("../web-limitations");

let rendered: Rendered | undefined;
afterEach(() => {
	rendered?.unmount();
	rendered = undefined;
	localStorage.clear();
	navigate.mockReset();
});

describe("On the web card", () => {
	it("lists the five things the web app lacks, and not browser read aloud", async () => {
		rendered = await render(<OnTheWebCard />);
		const items = [...rendered.container.querySelectorAll("li")].map((li) => li.textContent);
		expect(items).toEqual([
			"rsvpnano device",
			"Listening in the background and on the lock screen",
			"Reading reminders and notifications",
			"Turning pages with the volume keys",
			"Scanning a folder for books",
		]);
		expect(rendered.text()).toContain("Listen works while the app is open.");
		expect(rendered.container.querySelector("#on-the-web")).not.toBeNull();
	});

	it("sends Get the Android app to the Play Store listing", async () => {
		rendered = await render(<OnTheWebCard />);
		const button = rendered.getButton("Get the Android app");
		expect(button.dataset.slot, "the kit's button, not a text link").toBe("button");
		expect(button.className).toContain("h-11");
		await click(button);
		expect(openLink).toHaveBeenCalledWith(
			"https://play.google.com/store/apps/details?id=app.lesefluss",
			{ nativeTarget: "system" },
		);
	});
});

describe("library web limits line", () => {
	it("links to the On the web card in Settings and does not come back", async () => {
		rendered = await render(<WebLimitsLine />);
		expect(rendered.text()).toContain("need the Android app");
		await click(rendered.getButton("See what's different"));
		expect(navigate).toHaveBeenCalledWith({ to: "/tabs/settings", hash: "on-the-web" });
		expect(rendered.text()).toBe("");
		rendered.unmount();
		rendered = await render(<WebLimitsLine />);
		expect(rendered.text()).toBe("");
	});

	it("stays dismissed after the close button", async () => {
		rendered = await render(<WebLimitsLine />);
		await click(rendered.getButton("Dismiss"));
		expect(rendered.text()).toBe("");
		rendered.unmount();
		rendered = await render(<WebLimitsLine />);
		expect(rendered.text()).toBe("");
	});
});

describe("keepInView", () => {
	let resized: (() => void) | undefined;
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		resized = undefined;
	});

	function setup() {
		vi.useFakeTimers();
		vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => setTimeout(cb, 0));
		vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(cb: () => void) {
					resized = cb;
				}
				observe() {}
				disconnect() {
					resized = undefined;
				}
			},
		);
		const el = document.createElement("div");
		document.body.append(el);
		const scrollIntoView = vi.fn();
		el.scrollIntoView = scrollIntoView;
		return { el, scrollIntoView };
	}

	it("scrolls the card in, again while the page above it grows, until the reader scrolls", () => {
		const { el, scrollIntoView } = setup();
		const stop = keepInView(el, 1500);
		vi.advanceTimersByTime(1);
		expect(scrollIntoView).toHaveBeenCalledTimes(1);

		resized?.();
		vi.advanceTimersByTime(1);
		expect(scrollIntoView).toHaveBeenCalledTimes(2);

		window.dispatchEvent(new Event("wheel"));
		resized?.();
		vi.advanceTimersByTime(1);
		expect(scrollIntoView).toHaveBeenCalledTimes(2);
		stop();
		el.remove();
	});

	it("lets go once the page has settled", () => {
		const { el, scrollIntoView } = setup();
		keepInView(el, 1500);
		vi.advanceTimersByTime(1500);
		const calls = scrollIntoView.mock.calls.length;
		resized?.();
		vi.advanceTimersByTime(1);
		expect(scrollIntoView).toHaveBeenCalledTimes(calls);
		el.remove();
	});
});

describe("On the web card from See what's different", () => {
	it("drops the hash so a later return keeps its own scroll position", async () => {
		history.replaceState(null, "", "/tabs/settings#on-the-web");
		rendered = await render(<OnTheWebCard />);
		expect(window.location.hash).toBe("");
		expect(window.location.pathname).toBe("/tabs/settings");
	});
});
