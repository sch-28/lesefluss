import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Rendered, render } from "../../test/render";

const dismiss = vi.hoisted(() => vi.fn());
const confirmTick = vi.hoisted(() => vi.fn());
vi.mock("@lesefluss/ui/sonner", () => ({ toast: { dismiss } }));
vi.mock("../../services/haptics", () => ({ confirmTick }));

const { COMPLETE_MS, recordEmit, ToastCard } = await import("../toast-card");
type Content = Parameters<typeof ToastCard>[0]["content"];

let view: Rendered | undefined;
let reduced = false;

beforeEach(() => {
	vi.useFakeTimers();
	reduced = false;
	vi.stubGlobal("matchMedia", (query: string) => ({
		matches: reduced && query.includes("reduce"),
		addEventListener: () => {},
		removeEventListener: () => {},
	}));
});

afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

const card = (content: Content) => <ToastCard toastId="t1" content={content} />;
const q = (testId: string) => view?.container.querySelector(`[data-testid="${testId}"]`);
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

const undo = (onClick = vi.fn()): Content => ({
	kind: "success",
	message: "Removed",
	action: { label: "Undo", onClick },
	duration: 6000,
	version: 1,
});

describe("ToastCard", () => {
	it("counts an Undo toast down in seconds and dismisses it when time runs out", async () => {
		view = await render(card(undo()));
		expect(q("toast-undo-seconds")?.textContent).toBe("6");
		await advance(1000);
		expect(q("toast-undo-seconds")?.textContent).toBe("5");
		await advance(4900);
		expect(dismiss).not.toHaveBeenCalled();
		await advance(200);
		expect(dismiss).toHaveBeenCalledWith("t1");
	});

	it("holds the countdown while a finger rests on the card", async () => {
		view = await render(card(undo()));
		const pill = q("toast-card") as HTMLElement;
		await act(async () => {
			pill.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		});
		await advance(10_000);
		expect(dismiss).not.toHaveBeenCalled();
		expect(q("toast-undo-seconds")?.textContent).toBe("6");
		await act(async () => {
			pill.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
		});
		await advance(6100);
		expect(dismiss).toHaveBeenCalledWith("t1");
	});

	it("runs Undo, ticks and closes on tap", async () => {
		const onUndo = vi.fn();
		view = await render(card(undo(onUndo)));
		const button = view.getButton("Undo");
		await act(async () => button.click());
		expect(onUndo).toHaveBeenCalledOnce();
		expect(confirmTick).toHaveBeenCalledOnce();
		expect(dismiss).toHaveBeenCalledWith("t1");
	});

	it("keeps a toast its Retry shows again, and counts the result down", async () => {
		const failed: Content = {
			kind: "danger",
			message: "Couldn't add",
			action: { label: "Retry", onClick: () => recordEmit("t1", 2) },
			duration: 6000,
			version: 1,
		};
		view = await render(card(failed));
		const retry = view.getButton("Retry");
		await act(async () => {
			retry.focus();
			retry.click();
		});
		expect(dismiss).not.toHaveBeenCalled();

		await view.rerender(
			card({ kind: "loading", message: "Adding…", duration: Number.POSITIVE_INFINITY, version: 2 }),
		);
		await view.rerender(card({ kind: "success", message: "Added", duration: 2500, version: 3 }));
		await advance(COMPLETE_MS);
		await advance(2600);
		expect(dismiss).toHaveBeenCalledWith("t1");
	});

	it("shows a plain action toast with its kind's icon, not the ring", async () => {
		view = await render(
			card({
				kind: "danger",
				message: "Couldn't add",
				action: { label: "Retry", onClick: vi.fn() },
				duration: 6000,
				version: 1,
			}),
		);
		expect(q("toast-undo-ring")).toBeNull();
		expect(q("toast-icon")?.getAttribute("data-icon")).toBe("danger");
	});

	it("lets a loading bar finish before the result replaces it", async () => {
		const loading: Content = {
			kind: "loading",
			message: "Adding…",
			duration: Number.POSITIVE_INFINITY,
			version: 1,
		};
		view = await render(card(loading));
		expect(q("toast-loading-bar")).not.toBeNull();
		expect(q("toast-icon")).toBeNull();
		await advance(60_000);
		expect(dismiss).not.toHaveBeenCalled();

		await view.rerender(card({ kind: "success", message: "Added", duration: 2500, version: 2 }));
		expect(q("toast-bar-done")).not.toBeNull();
		expect(view.text()).toContain("Adding…");
		await advance(COMPLETE_MS);
		expect(q("toast-loading-bar")).toBeNull();
		expect(view.text()).toContain("Added");
		expect(q("toast-icon")?.getAttribute("data-icon")).toBe("success");
		await advance(2600);
		expect(dismiss).toHaveBeenCalledWith("t1");
	});

	it("shows a failed load at once, without finishing the bar", async () => {
		view = await render(
			card({ kind: "loading", message: "Adding…", duration: Number.POSITIVE_INFINITY, version: 1 }),
		);
		await view.rerender(
			card({ kind: "danger", message: "Couldn't add", duration: 4000, version: 2 }),
		);
		expect(q("toast-bar-done")).toBeNull();
		expect(view.text()).toContain("Couldn't add");
	});

	it("pops the wishlist heart with sparks", async () => {
		view = await render(
			card({ kind: "wishlist", message: "Added to your wishlist", duration: 2200, version: 1 }),
		);
		expect(q("toast-icon")?.getAttribute("data-icon")).toBe("wishlist");
		expect(view.container.querySelectorAll('[data-testid="toast-spark"]')).toHaveLength(6);
	});

	it("starts the check undrawn, to draw it in", async () => {
		view = await render(card({ kind: "success", message: "Saved", duration: 2500, version: 1 }));
		expect(view.container.querySelector("path")?.getAttribute("stroke-dasharray")).toBe("0 1");
	});

	describe("with reduced motion", () => {
		beforeEach(() => {
			reduced = true;
		});

		it("drops the sparks and draws icons complete", async () => {
			view = await render(
				card({ kind: "wishlist", message: "Added to your wishlist", duration: 2200, version: 1 }),
			);
			expect(view.container.querySelectorAll('[data-testid="toast-spark"]')).toHaveLength(0);
			view.unmount();
			view = await render(card({ kind: "success", message: "Saved", duration: 2500, version: 1 }));
			// framer-motion draws a path through its dash array: "0 1" is unstarted, "1 1" complete.
			expect(view.container.querySelector("path")?.getAttribute("stroke-dasharray")).toBe("1 1");
		});

		it("swaps a finished load for its result at once", async () => {
			view = await render(
				card({
					kind: "loading",
					message: "Adding…",
					duration: Number.POSITIVE_INFINITY,
					version: 1,
				}),
			);
			await view.rerender(card({ kind: "success", message: "Added", duration: 2500, version: 2 }));
			expect(q("toast-bar-done")).toBeNull();
			expect(view.text()).toContain("Added");
		});
	});
});
