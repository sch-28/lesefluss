import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";

const applyUpdate = vi.fn(async () => {});
vi.mock("@/services/app-update", async () => {
	const { createFlag } = await import("@/commands/signal");
	return { appUpdateReady: createFlag(), applyUpdate: () => applyUpdate() };
});

let lastReadBookId: string | null = "b1";
vi.mock("@/services/db/hooks", () => ({
	queryHooks: { useLastReadBookId: () => ({ data: lastReadBookId }) },
}));

import { appUpdateReady } from "@/services/app-update";
import { addButtonShown, tabBarHidden } from "../app-shell/tab-bar-visibility";
import { AppUpdateBar } from "../app-update-bar";

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
	act(() => {
		appUpdateReady.set(false);
		tabBarHidden.set(false);
		addButtonShown.set(false);
	});
	lastReadBookId = "b1";
});

const bar = () => document.querySelector('[role="status"]');
const button = (name: string) =>
	[...document.querySelectorAll("button")].find(
		(b) => b.textContent === name || b.getAttribute("aria-label") === name,
	);

describe("AppUpdateBar", () => {
	it("stays away until a new build is ready", async () => {
		view = await render(<AppUpdateBar />);
		expect(bar()).toBeNull();
		act(() => appUpdateReady.set(true));
		expect(bar()?.textContent).toContain("A new version is ready");
		expect(bar()?.textContent).toContain("Your place is saved.");
	});

	it("reloads on Reload and shows it is on it", async () => {
		appUpdateReady.set(true);
		view = await render(<AppUpdateBar />);
		act(() => button("Reload")?.click());
		expect(applyUpdate).toHaveBeenCalledOnce();
		expect(button("Reloading…")?.disabled).toBe(true);
	});

	it("offers Reload again when saving before the reload fails", async () => {
		applyUpdate.mockRejectedValueOnce(new Error("disk full"));
		appUpdateReady.set(true);
		view = await render(<AppUpdateBar />);
		await act(async () => button("Reload")?.click());
		expect(button("Reload")?.disabled).toBe(false);
	});

	it("gives the bottom to a screen's own bar and comes back after", async () => {
		appUpdateReady.set(true);
		view = await render(<AppUpdateBar />);
		act(() => tabBarHidden.set(true));
		expect(bar()).toBeNull();
		act(() => tabBarHidden.set(false));
		expect(bar()).not.toBeNull();
	});

	it("does not promise a saved place before any book was read", async () => {
		lastReadBookId = null;
		appUpdateReady.set(true);
		view = await render(<AppUpdateBar />);
		expect(bar()?.textContent).toContain("A new version is ready");
		expect(bar()?.textContent).not.toContain("Your place is saved.");
	});

	it("lifts above the library's add button only while it is shown", async () => {
		appUpdateReady.set(true);
		view = await render(<AppUpdateBar />);
		const lifted = "bottom-[calc(var(--tab-bar-h)+var(--safe-bottom)+5rem)]";
		expect((bar() as HTMLElement).className).not.toContain(lifted);
		act(() => addButtonShown.set(true));
		expect((bar() as HTMLElement).className).toContain(lifted);
	});

	it("lets clicks through around its card", async () => {
		appUpdateReady.set(true);
		view = await render(<AppUpdateBar />);
		const wrapper = bar() as HTMLElement;
		expect(wrapper.className).toContain("pointer-events-none");
		expect((wrapper.firstElementChild as HTMLElement).className).toContain("pointer-events-auto");
	});

	it("stays hidden once dismissed", async () => {
		appUpdateReady.set(true);
		view = await render(<AppUpdateBar />);
		act(() => button("Dismiss")?.click());
		expect(bar()).toBeNull();
	});
});
