import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const legacy = vi.hoisted(() => ({ deleted: 0 }));
vi.mock("../web/legacy-store", async (importActual) => ({
	...(await importActual<typeof import("../web/legacy-store")>()),
	deleteLegacyIdb: async () => {
		legacy.deleted++;
	},
}));

import { wipeWebStores } from "../web/client";
import { hasActiveMarker, writeActiveMarker } from "../web/opfs-layout";

/** An OPFS root holding named directories; removing one can be made to fail while a handle is open. */
function fakeOpfs() {
	const entries = new Map<string, Set<string>>();
	let busyRemovals = 0;
	const dir = (files: Set<string>) => ({
		async getFileHandle(name: string, options?: { create?: boolean }) {
			if (!files.has(name)) {
				if (!options?.create) throw new DOMException("missing", "NotFoundError");
				files.add(name);
			}
			return { name };
		},
	});
	const root = {
		async getDirectoryHandle(name: string, options?: { create?: boolean }) {
			let files = entries.get(name);
			if (!files) {
				if (!options?.create) throw new DOMException("missing", "NotFoundError");
				files = new Set();
				entries.set(name, files);
			}
			return dir(files);
		},
		async removeEntry(name: string) {
			if (busyRemovals > 0) {
				busyRemovals--;
				throw new DOMException("in use", "NoModificationAllowedError");
			}
			if (!entries.delete(name)) throw new DOMException("missing", "NotFoundError");
		},
	};
	return {
		storage: { getDirectory: async () => root },
		failNextRemovals(n: number) {
			busyRemovals = n;
		},
	};
}

let opfs: ReturnType<typeof fakeOpfs>;

beforeEach(() => {
	legacy.deleted = 0;
	opfs = fakeOpfs();
	vi.stubGlobal("navigator", { ...navigator, storage: opfs.storage });
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("wipeWebStores", () => {
	it("removes the OPFS library and the legacy store", async () => {
		await writeActiveMarker();
		await wipeWebStores();
		expect(await hasActiveMarker()).toBe(false);
		expect(legacy.deleted).toBe(1);
	});

	it("keeps trying while the closing worker still holds the OPFS files", async () => {
		vi.useFakeTimers();
		await writeActiveMarker();
		opfs.failNextRemovals(2);
		const wiped = wipeWebStores();
		await vi.runAllTimersAsync();
		await wiped;
		expect(await hasActiveMarker()).toBe(false);
	});

	it("succeeds when there is no OPFS library yet", async () => {
		await expect(wipeWebStores()).resolves.toBeUndefined();
		expect(legacy.deleted).toBe(1);
	});
});
