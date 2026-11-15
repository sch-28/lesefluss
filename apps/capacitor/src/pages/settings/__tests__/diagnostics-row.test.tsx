import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceDiagnostics } from "@/services/telemetry";
import { click, type Rendered, render } from "../../../test/render";

const device = vi.hoisted(() => ({ current: null as DeviceDiagnostics | null }));
vi.mock("@/services/telemetry", () => ({
	getDeviceDiagnostics: () => Promise.resolve(device.current),
}));
vi.mock("@/utils/safe-area", () => ({ probeSafeArea: () => null }));
vi.mock("@/components/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { DiagnosticsRow } = await import("../diagnostics-row");

let view: Rendered | undefined;
afterEach(() => {
	view?.unmount();
	view = undefined;
});

async function show(next: DeviceDiagnostics) {
	device.current = next;
	view = await render(<DiagnosticsRow />);
	await act(async () => {});
	await click(view.getButton(/Diagnostics/));
	return view;
}

describe("DiagnosticsRow", () => {
	it("calls a desktop browser a browser and drops the unknown version and OS", async () => {
		const v = await show({ version: "unknown", platform: "web", webview: "131.0" });
		const text = v.text();
		expect(text).toContain("Browser 131.0");
		expect(text).not.toContain("WebView");
		expect(text).not.toContain("vunknown");
		expect(text).not.toContain("unknown OS");
	});

	it("keeps version, OS and WebView on the phone", async () => {
		const v = await show({
			version: "2.2.0",
			platform: "android",
			os: "Android 15",
			webview: "148.0",
		});
		const text = v.text();
		expect(text).toContain("v2.2.0 · WebView 148.0");
		expect(text).toContain("android · Android 15 · WebView 148.0");
	});
});
