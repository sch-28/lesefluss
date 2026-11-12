import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbDriver } from "../types";

const platform = vi.hoisted(() => ({ native: false, opfs: true, idb: true, legacyFails: false }));
const opened = vi.hoisted(() => ({ fail: null as Error | null }));

vi.mock("@capacitor/core", () => ({
	Capacitor: { isNativePlatform: () => platform.native },
}));
vi.mock("../native", () => ({
	createCapacitorDriver: (kind: string) => ({ kind }) as DbDriver,
}));
vi.mock("../web/opfs-layout", () => ({ hasOpfsApi: () => platform.opfs }));
vi.mock("../web/legacy", () => ({
	createLegacyDriver: async () => {
		if (platform.legacyFails) throw new Error("jeep failed");
		return { kind: "legacy" } as DbDriver;
	},
}));
vi.mock("../web/legacy-store", () => ({ canOpenIndexedDb: async () => platform.idb }));
vi.mock("../web/client", async () => {
	const actual = await vi.importActual<typeof import("../web/client")>("../web/client");
	return {
		...actual,
		openOpfsDriver: async (_spawn: unknown, onWaiting?: () => void) => {
			onWaiting?.();
			if (opened.fail) throw opened.fail;
			return { kind: "opfs" } as DbDriver;
		},
	};
});

const { createDriver, STORAGE_UNAVAILABLE_ERROR } = await import("../index");
const { OpfsUnavailableError, StorageBusyError } = await import("../web/client");

describe("createDriver", () => {
	beforeEach(() => {
		platform.native = false;
		platform.opfs = true;
		platform.idb = true;
		platform.legacyFails = false;
		opened.fail = null;
	});

	it("uses the native plugin on Android", async () => {
		platform.native = true;
		expect((await createDriver()).kind).toBe("native");
	});

	it("uses OPFS on the web when it opens", async () => {
		expect((await createDriver()).kind).toBe("opfs");
	});

	it("uses the legacy store in a browser without OPFS", async () => {
		platform.opfs = false;
		expect((await createDriver()).kind).toBe("legacy");
	});

	it("uses the legacy store when OPFS never became the store", async () => {
		opened.fail = new OpfsUnavailableError(new Error("no handles"));
		expect((await createDriver()).kind).toBe("legacy");
	});

	it("stops instead of opening the legacy store while the library is on OPFS but busy", async () => {
		opened.fail = new StorageBusyError();
		await expect(createDriver()).rejects.toBeInstanceOf(StorageBusyError);
	});

	it("passes the wait on to the caller", async () => {
		const onWaiting = vi.fn();
		await createDriver({ onWaiting });
		expect(onWaiting).toHaveBeenCalled();
	});

	it("reports no usable storage when OPFS is missing and IndexedDB refuses", async () => {
		platform.opfs = false;
		platform.idb = false;
		await expect(createDriver()).rejects.toMatchObject({ name: STORAGE_UNAVAILABLE_ERROR });
	});

	it("reports no usable storage when the legacy store can't start either", async () => {
		opened.fail = new OpfsUnavailableError(new Error("SecurityError"));
		platform.legacyFails = true;
		await expect(createDriver()).rejects.toMatchObject({ name: STORAGE_UNAVAILABLE_ERROR });
	});

	it("stops on any other failure instead of guessing the store", async () => {
		opened.fail = new Error("unexpected");
		await expect(createDriver()).rejects.toThrow("unexpected");
	});
});
