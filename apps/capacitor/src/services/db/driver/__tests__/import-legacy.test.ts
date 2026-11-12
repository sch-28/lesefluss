// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type OpfsStoreDeps, prepareOpfsStore } from "../web/import-legacy";

interface Stores {
	marker: boolean;
	legacy: Uint8Array | undefined;
	dbFile: Uint8Array | undefined;
}

/** In-memory OPFS pool + legacy IndexedDB store, recording the order of the writes. */
function fakeStores(initial: Partial<Stores>, overrides: Partial<OpfsStoreDeps> = {}) {
	const state: Stores = { marker: false, legacy: undefined, dbFile: undefined, ...initial };
	const events: string[] = [];
	const warnings: string[] = [];
	const deps: OpfsStoreDeps = {
		hasMarker: async () => state.marker,
		writeMarker: async () => {
			state.marker = true;
			events.push("marker");
		},
		hasLegacy: async () => state.legacy !== undefined,
		readLegacy: async () => state.legacy,
		deleteLegacy: async () => {
			state.legacy = undefined;
			events.push("deleteLegacy");
		},
		hasDbFile: () => state.dbFile !== undefined,
		importDb: async (bytes) => {
			state.dbFile = bytes;
			events.push("import");
			return bytes.byteLength;
		},
		unlinkDb: () => {
			state.dbFile = undefined;
			events.push("unlink");
		},
		verify: async () => {
			events.push("verify");
		},
		warn: (message) => {
			warnings.push(message);
		},
		...overrides,
	};
	return { state, events, warnings, deps };
}

const OLD_LIBRARY = new Uint8Array([1, 2, 3, 4]);

describe("prepareOpfsStore", () => {
	it("moves the legacy store, deleting it only after the copy is verified and marked", async () => {
		const { state, events, deps } = fakeStores({ legacy: OLD_LIBRARY });

		expect(await prepareOpfsStore(deps)).toBe("moved");

		expect(events).toEqual(["import", "verify", "marker", "deleteLegacy"]);
		expect(state.dbFile).toEqual(OLD_LIBRARY);
		expect(state.legacy).toBeUndefined();
	});

	it("keeps the legacy store and drops the copy when verification fails", async () => {
		const { state, deps } = fakeStores(
			{ legacy: OLD_LIBRARY },
			{
				verify: async () => {
					throw new Error("corrupt");
				},
			},
		);

		await expect(prepareOpfsStore(deps)).rejects.toThrow("corrupt");

		expect(state.legacy).toEqual(OLD_LIBRARY);
		expect(state.dbFile).toBeUndefined();
		expect(state.marker).toBe(false);
	});

	it("keeps the legacy store when the import writes fewer bytes than it holds", async () => {
		const { state, deps } = fakeStores({ legacy: OLD_LIBRARY }, { importDb: async () => 2 });

		await expect(prepareOpfsStore(deps)).rejects.toThrow("Imported 2 of 4 bytes");

		expect(state.legacy).toEqual(OLD_LIBRARY);
		expect(state.marker).toBe(false);
	});

	it("keeps the legacy store when the marker cannot be written", async () => {
		const { state, deps } = fakeStores(
			{ legacy: OLD_LIBRARY },
			{
				writeMarker: async () => {
					throw new Error("quota");
				},
			},
		);

		await expect(prepareOpfsStore(deps)).rejects.toThrow("quota");

		expect(state.legacy).toEqual(OLD_LIBRARY);
		expect(state.dbFile).toBeUndefined();
	});

	it("retries the move on the next start after a failed one", async () => {
		let failVerify = true;
		const { state, deps } = fakeStores(
			{ legacy: OLD_LIBRARY },
			{
				verify: async () => {
					if (failVerify) throw new Error("corrupt");
				},
			},
		);
		await expect(prepareOpfsStore(deps)).rejects.toThrow();

		failVerify = false;
		expect(await prepareOpfsStore(deps)).toBe("moved");
		expect(state.dbFile).toEqual(OLD_LIBRARY);
		expect(state.legacy).toBeUndefined();
	});

	it("still uses OPFS when the legacy copy cannot be deleted after the move", async () => {
		const { state, warnings, deps } = fakeStores(
			{ legacy: OLD_LIBRARY },
			{
				deleteLegacy: async () => {
					throw new Error("blocked");
				},
			},
		);

		expect(await prepareOpfsStore(deps)).toBe("moved");

		expect(state.marker).toBe(true);
		expect(warnings).toHaveLength(1);
	});

	it("never imports the legacy store again once OPFS is the store, and deletes the leftover", async () => {
		const current = new Uint8Array([9, 9]);
		const { state, events, warnings, deps } = fakeStores({
			marker: true,
			dbFile: current,
			legacy: OLD_LIBRARY,
		});

		expect(await prepareOpfsStore(deps)).toBe("existing");

		expect(events).toEqual(["deleteLegacy"]);
		expect(state.dbFile).toBe(current);
		expect(warnings).toEqual([]);
	});

	it("starts a new user on OPFS and drops a database left by an unfinished move", async () => {
		const { state, events, deps } = fakeStores({ dbFile: new Uint8Array([7]) });

		expect(await prepareOpfsStore(deps)).toBe("fresh");

		expect(events).toEqual(["unlink", "marker"]);
		expect(state.dbFile).toBeUndefined();
	});
});
