import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ name: "android" }));
const setResizeMode = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@capacitor/core", () => ({
	Capacitor: { isNativePlatform: () => platform.name !== "web", getPlatform: () => platform.name },
}));
vi.mock("@capacitor/keyboard", () => ({
	Keyboard: { setResizeMode },
	KeyboardResize: { Native: "native" },
}));
vi.mock("@capacitor/status-bar", () => ({
	StatusBar: { setStyle: vi.fn(async () => {}), setOverlaysWebView: vi.fn(async () => {}) },
	Style: { Default: "DEFAULT" },
}));

const { bootstrapCapacitor } = await import("../bootstrap-capacitor");

describe("bootstrapCapacitor", () => {
	beforeEach(() => setResizeMode.mockClear());

	it("leaves the keyboard alone on Android, where the plugin only rejects", async () => {
		platform.name = "android";
		await bootstrapCapacitor();
		expect(setResizeMode).not.toHaveBeenCalled();
	});

	it("sets the native resize mode on iOS", async () => {
		platform.name = "ios";
		await bootstrapCapacitor();
		expect(setResizeMode).toHaveBeenCalledWith({ mode: "native" });
	});
});
