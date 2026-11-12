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

const { OnTheWebCard, WebLimitsLine } = await import("../web-limitations");

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
			"Read aloud in the background and on the lock screen",
			"Reading reminders and notifications",
			"Turning pages with the volume keys",
			"Scanning a folder for books",
		]);
		expect(rendered.text()).toContain("Read aloud works while the app is open.");
		expect(rendered.container.querySelector("#on-the-web")).not.toBeNull();
	});

	it("sends Get the Android app to the Play Store listing", async () => {
		rendered = await render(<OnTheWebCard />);
		await click(rendered.getButton("Get the Android app"));
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
