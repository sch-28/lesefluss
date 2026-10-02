import { describe, expect, it, vi } from "vitest";
import { checkScanReadiness, isPermissionDeniedError, type RadioApi } from "../readiness";

function radio({
	enabled = true,
	location = true,
	enableResult = "accept",
}: {
	enabled?: boolean;
	location?: boolean;
	enableResult?: "accept" | "decline";
} = {}) {
	return {
		isEnabled: vi.fn(async () => enabled),
		requestEnable: vi.fn(async () => {
			if (enableResult === "decline") throw new Error("requestEnable failed.");
		}),
		isLocationEnabled: vi.fn(async () => location),
	} satisfies RadioApi;
}

describe("checkScanReadiness", () => {
	it("is ready when the radio and location are on", async () => {
		const api = radio();
		expect(await checkScanReadiness(api, { isAndroid: true, interactive: false })).toBeNull();
		expect(api.requestEnable).not.toHaveBeenCalled();
	});

	it("reports bluetooth-off without prompting during auto-scan", async () => {
		const api = radio({ enabled: false });
		expect(await checkScanReadiness(api, { isAndroid: true, interactive: false })).toBe(
			"bluetooth-off",
		);
		expect(api.requestEnable).not.toHaveBeenCalled();
	});

	it("prompts on Android when the user asked to scan and continues once enabled", async () => {
		const api = radio({ enabled: false });
		expect(await checkScanReadiness(api, { isAndroid: true, interactive: true })).toBeNull();
		expect(api.requestEnable).toHaveBeenCalledOnce();
	});

	it("reports bluetooth-off when the user declines the enable prompt", async () => {
		const api = radio({ enabled: false, enableResult: "decline" });
		expect(await checkScanReadiness(api, { isAndroid: true, interactive: true })).toBe(
			"bluetooth-off",
		);
	});

	it("never prompts on iOS, where requestEnable is unsupported", async () => {
		const api = radio({ enabled: false });
		expect(await checkScanReadiness(api, { isAndroid: false, interactive: true })).toBe(
			"bluetooth-off",
		);
		expect(api.requestEnable).not.toHaveBeenCalled();
	});

	it("reports location-off on Android after the radio is enabled", async () => {
		const api = radio({ enabled: false, location: false });
		expect(await checkScanReadiness(api, { isAndroid: true, interactive: true })).toBe(
			"location-off",
		);
	});

	it("skips the location check off Android", async () => {
		const api = radio({ location: false });
		expect(await checkScanReadiness(api, { isAndroid: false, interactive: false })).toBeNull();
		expect(api.isLocationEnabled).not.toHaveBeenCalled();
	});
});

describe("isPermissionDeniedError", () => {
	it("matches the Android and iOS plugin rejections", () => {
		expect(isPermissionDeniedError("Permission denied.")).toBe(true);
		expect(isPermissionDeniedError("BLE permission denied")).toBe(true);
	});

	it("ignores other init failures", () => {
		expect(isPermissionDeniedError("BLE is not supported.")).toBe(false);
		expect(isPermissionDeniedError(undefined)).toBe(false);
	});
});
