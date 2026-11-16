import { createMemoryHistory } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../../test/render";

const listeners: (() => void)[] = [];
const exitApp = vi.fn();
vi.mock("@capacitor/app", () => ({
	App: {
		addListener: (_event: string, fn: () => void) => {
			listeners.push(fn);
			return Promise.resolve({ remove: () => {} });
		},
		exitApp: () => exitApp(),
	},
}));

let history = createMemoryHistory({ initialEntries: ["/"] });
vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	useRouter: () => ({ history }),
}));

let isOverlayOpen = false;
vi.mock("@lesefluss/ui/overlay-back", () => ({ consumeBackPress: () => isOverlayOpen }));

const { HardwareBack } = await import("../hardware-back");

let rendered: Rendered;
const pressBack = () => listeners.at(-1)?.();

beforeEach(async () => {
	listeners.length = 0;
	exitApp.mockClear();
	isOverlayOpen = false;
	history = createMemoryHistory({ initialEntries: ["/"] });
	rendered = await render(<HardwareBack />);
});

afterEach(() => rendered.unmount());

describe("HardwareBack", () => {
	it("walks back from an auto-opened book to the library, then exits", () => {
		history.replace("/tabs/library");
		history.push("/tabs/reader/b1");

		pressBack();
		expect(history.location.pathname).toBe("/tabs/library");
		expect(exitApp).not.toHaveBeenCalled();

		pressBack();
		expect(exitApp).toHaveBeenCalledOnce();
	});

	it("sends a root tab to the Library instead of replaying old tab history", () => {
		history.replace("/tabs/library");
		history.push("/tabs/settings");
		history.push("/tabs/settings/licenses");
		history.push("/tabs/settings");
		history.push("/tabs/library");
		history.push("/tabs/explore");

		pressBack();
		expect(history.location.pathname).toBe("/tabs/library");
		expect(exitApp).not.toHaveBeenCalled();

		pressBack();
		expect(exitApp).toHaveBeenCalledOnce();
	});

	it("walks Library, Stats, book, back, back to the Library", () => {
		history.replace("/tabs/library");
		history.push("/tabs/stats");
		history.push("/tabs/library/book/b1");

		pressBack();
		expect(history.location.pathname).toBe("/tabs/stats");
		pressBack();
		expect(history.location.pathname).toBe("/tabs/library");
		pressBack();
		expect(exitApp).toHaveBeenCalledOnce();
	});

	it("sends a Stats sub-tab to Overview, not to the tab before it", () => {
		history.replace("/tabs/settings");
		history.push("/tabs/stats?tab=sessions");

		pressBack();
		expect(history.location.pathname).toBe("/tabs/stats");
		expect(history.location.search).toBe("");
		pressBack();
		expect(history.location.pathname).toBe("/tabs/library");
	});

	it("leaves the press to an open overlay", () => {
		history.push("/tabs/settings");
		isOverlayOpen = true;
		pressBack();
		expect(history.location.pathname).toBe("/tabs/settings");
		expect(exitApp).not.toHaveBeenCalled();
	});
});
