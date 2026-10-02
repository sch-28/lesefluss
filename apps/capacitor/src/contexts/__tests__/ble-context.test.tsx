import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, type Rendered, render } from "../../test/render";

const mocks = vi.hoisted(() => ({
	resumeListeners: [] as Array<() => void>,
	bleClient: {
		canRequestEnable: true,
		connectionState: "disconnected",
		connectedDevice: null,
		connectedDescriptorId: null,
		initialize: vi.fn(),
		checkScanReadiness: vi.fn(),
		startScan: vi.fn(),
		stopScan: vi.fn(),
		watchEnabled: vi.fn(),
		openSettingsFor: vi.fn(),
		disconnect: vi.fn(),
	},
}));

vi.mock("../../utils/platform", () => ({ IS_WEB: false }));
vi.mock("@capacitor/preferences", () => ({
	Preferences: {
		get: vi.fn(async () => ({ value: "true" })),
		set: vi.fn(async () => {}),
	},
}));
vi.mock("@capacitor/app", () => ({
	App: {
		addListener: vi.fn((_event: string, cb: () => void) => {
			mocks.resumeListeners.push(cb);
			return Promise.resolve({
				remove: async () => {
					mocks.resumeListeners = mocks.resumeListeners.filter((l) => l !== cb);
				},
			});
		}),
	},
}));
vi.mock("../../services/ble", async () => {
	const readiness = await import("../../services/ble/readiness");
	const types = await import("../../services/ble/types");
	return {
		ble: {},
		bleClient: mocks.bleClient,
		BLEConnectionState: types.BLEConnectionState,
		isPermissionDeniedError: readiness.isPermissionDeniedError,
	};
});
vi.mock("../../services/ble-transport", () => ({ createBleAdapter: vi.fn() }));
vi.mock("../../services/devices", () => ({
	MULTI_BOOK_DESCRIPTOR_ID: "multi-book",
	multiBookDescriptor: {},
}));
vi.mock("../../services/db/queries", () => ({
	queries: {
		clearAllDevices: vi.fn(async () => {}),
		getPairedDevices: vi.fn(async () => []),
	},
}));

import { BLEProvider, useBLE } from "../ble-context";

type Ctx = ReturnType<typeof useBLE>;
let ctx: Ctx;
function Probe() {
	ctx = useBLE();
	return null;
}

let view: Rendered | undefined;
let radioListener: ((enabled: boolean) => void) | undefined;

beforeEach(() => {
	mocks.resumeListeners = [];
	radioListener = undefined;
	const c = mocks.bleClient;
	c.initialize.mockResolvedValue({ success: true });
	c.checkScanReadiness.mockResolvedValue(null);
	c.startScan.mockResolvedValue({ success: true });
	c.stopScan.mockResolvedValue({ success: true });
	c.watchEnabled.mockImplementation(async (cb: (enabled: boolean) => void) => {
		radioListener = cb;
		return () => {};
	});
	c.openSettingsFor.mockResolvedValue(undefined);
});

afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

async function mount() {
	view = await render(
		<BLEProvider>
			<Probe />
		</BLEProvider>,
	);
	await flush();
	await flush();
}

async function resume() {
	await act(async () => {
		for (const l of [...mocks.resumeListeners]) l();
	});
	await flush();
	await flush();
}

describe("BLEProvider scan blockers", () => {
	it("keeps a permission-denied blocker through a manual scan and re-initializes on resume", async () => {
		mocks.bleClient.initialize.mockResolvedValueOnce({
			success: false,
			error: "Permission denied.",
		});
		await mount();
		expect(ctx.scanBlocker).toBe("permission-denied");
		expect(mocks.bleClient.checkScanReadiness).not.toHaveBeenCalled();

		await act(() => ctx.startScan());
		expect(ctx.scanBlocker).toBe("permission-denied");
		expect(mocks.bleClient.checkScanReadiness).not.toHaveBeenCalled();

		await resume();
		expect(mocks.bleClient.initialize).toHaveBeenCalledTimes(2);
		expect(ctx.scanBlocker).toBeNull();
		expect(mocks.bleClient.checkScanReadiness).toHaveBeenCalledWith(false);
		expect(mocks.bleClient.startScan).toHaveBeenCalled();
	});

	it("pauses auto-scan while Bluetooth is off without prompting, then resumes when it turns on", async () => {
		mocks.bleClient.checkScanReadiness.mockResolvedValueOnce("bluetooth-off");
		await mount();
		expect(ctx.scanBlocker).toBe("bluetooth-off");
		expect(mocks.bleClient.checkScanReadiness).toHaveBeenCalledTimes(1);
		expect(mocks.bleClient.checkScanReadiness).toHaveBeenCalledWith(false);
		expect(mocks.bleClient.startScan).not.toHaveBeenCalled();

		await act(async () => radioListener?.(true));
		await flush();
		expect(ctx.scanBlocker).toBeNull();
		expect(mocks.bleClient.startScan).toHaveBeenCalledTimes(1);
	});

	it("keeps the previous blocker when the readiness check itself fails", async () => {
		mocks.bleClient.checkScanReadiness.mockResolvedValueOnce("location-off");
		await mount();
		expect(ctx.scanBlocker).toBe("location-off");

		mocks.bleClient.checkScanReadiness.mockRejectedValueOnce(new Error("boom"));
		await act(() => ctx.startScan());
		expect(ctx.scanBlocker).toBe("location-off");
		expect(ctx.isScanning).toBe(false);
		expect(mocks.bleClient.startScan).not.toHaveBeenCalled();
	});

	it("backs off auto-scan while the readiness check keeps failing", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			mocks.bleClient.checkScanReadiness.mockRejectedValue(new Error("boom"));
			await mount();
			expect(mocks.bleClient.checkScanReadiness).toHaveBeenCalledTimes(1);

			await act(() => vi.advanceTimersByTimeAsync(5_000));
			await flush();
			expect(mocks.bleClient.checkScanReadiness).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("offers no in-app fix for Bluetooth off where requestEnable is unavailable", async () => {
		mocks.bleClient.canRequestEnable = false;
		try {
			mocks.bleClient.checkScanReadiness.mockResolvedValueOnce("bluetooth-off");
			await mount();
			expect(ctx.scanBlocker).toBe("bluetooth-off");
			expect(ctx.canResolveScanBlocker).toBe(false);
		} finally {
			mocks.bleClient.canRequestEnable = true;
		}
	});
});
