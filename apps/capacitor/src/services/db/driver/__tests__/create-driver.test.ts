import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbDriver } from "../types";

const platform = vi.hoisted(() => ({ native: false, opfs: true }));
const opened = vi.hoisted(() => ({ fail: null as Error | null }));

vi.mock("@capacitor/core", () => ({
	Capacitor: { isNativePlatform: () => platform.native },
}));
vi.mock("../native", () => ({
	createCapacitorDriver: (kind: string) => ({ kind }) as DbDriver,
}));
vi.mock("../web/opfs-layout", () => ({ hasOpfsApi: () => platform.opfs }));
vi.mock("../web/legacy", () => ({
	createLegacyDriver: async () => ({ kind: "legacy" }) as DbDriver,
}));
vi.mock("../web/client", async () => {
	const actual = await vi.importActual<typeof import("../web/client")>("../web/client");
	return {
		...actual,
		openOpfsDriver: async () => {
			if (opened.fail) throw opened.fail;
			return { kind: "opfs" } as DbDriver;
		},
	};
});

const { createDriver } = await import("../index");
const { OpfsUnavailableError, StorageBusyError } = await import("../web/client");

describe("createDriver", () => {
	beforeEach(() => {
		platform.native = false;
		platform.opfs = true;
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

	it("stops on any other failure instead of guessing the store", async () => {
		opened.fail = new Error("unexpected");
		await expect(createDriver()).rejects.toThrow("unexpected");
	});
});
