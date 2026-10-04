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
vi.mock("../../../services/overlay-back", () => ({ consumeBackPress: () => isOverlayOpen }));

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

	it("leaves the press to an open overlay", () => {
		history.push("/tabs/settings");
		isOverlayOpen = true;
		pressBack();
		expect(history.location.pathname).toBe("/tabs/settings");
		expect(exitApp).not.toHaveBeenCalled();
	});
});
