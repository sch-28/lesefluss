import { afterEach, describe, expect, it, vi } from "vitest";
import { silenceResizeObserverLoop } from "../resize-observer-loop";

const LOOP = "ResizeObserver loop completed with undelivered notifications.";

afterEach(() => {
	window.onerror = null;
});

describe("silenceResizeObserverLoop", () => {
	it("keeps the loop report from the logger that was there and cancels it", () => {
		const logger = vi.fn(() => false);
		window.onerror = logger;
		silenceResizeObserverLoop();
		expect(window.onerror?.(LOOP)).toBe(true);
		expect(logger).not.toHaveBeenCalled();
	});

	it("hands every other error to that logger", () => {
		const logger = vi.fn(() => false);
		window.onerror = logger;
		silenceResizeObserverLoop();
		const error = new TypeError("x is undefined");
		expect(window.onerror?.("Uncaught TypeError", "app.js", 1, 2, error)).toBe(false);
		expect(logger).toHaveBeenCalledWith("Uncaught TypeError", "app.js", 1, 2, error);
	});

	it("works without a logger", () => {
		silenceResizeObserverLoop();
		expect(window.onerror?.(LOOP)).toBe(true);
		expect(window.onerror?.("other")).toBe(false);
	});
});
