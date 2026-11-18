import { describe, expect, it } from "vitest";
import { dataViewToString } from "../../../ble/utils/encoding";
import { resolveSingleBookSyncTarget } from "../sync-target";

// Storage characteristic value from the LESE-218 logcat, as the device sent it.
const LOGGED_STORAGE_HEX =
	"7B22667265655F6279746573223A2031333639323932382C2022626F6F6B5F68617368223A20223537353639613163222C2022746F74616C5F6279746573223A2031343638303036347D";

function loggedDeviceHash(): string {
	const bytes = new Uint8Array(
		LOGGED_STORAGE_HEX.match(/../g)?.map((h) => Number.parseInt(h, 16)) ?? [],
	);
	return (JSON.parse(dataViewToString(new DataView(bytes.buffer))) as { book_hash: string })
		.book_hash;
}

describe("resolveSingleBookSyncTarget", () => {
	it("reports the logged device book as unknown when the library holds only a re-import", () => {
		const deviceHash = loggedDeviceHash();
		expect(deviceHash).toBe("57569a1c");
		expect(resolveSingleBookSyncTarget(deviceHash, null, ["2a41e018"])).toEqual({
			kind: "unknown",
			deviceHash: "57569a1c",
			staleActiveId: null,
		});
	});

	it("syncs the device's book when the app remembers a different active book", () => {
		expect(
			resolveSingleBookSyncTarget(loggedDeviceHash(), "2a41e018", ["2a41e018", "57569a1c"]),
		).toEqual({ kind: "sync", bookId: "57569a1c", restored: true });
	});

	it("syncs the active book when the device holds it", () => {
		expect(resolveSingleBookSyncTarget("57569a1c", "57569a1c", ["57569a1c"])).toEqual({
			kind: "sync",
			bookId: "57569a1c",
			restored: false,
		});
	});

	it("restores the device's book when no book is active", () => {
		expect(resolveSingleBookSyncTarget("57569a1c", null, ["57569a1c"])).toEqual({
			kind: "sync",
			bookId: "57569a1c",
			restored: true,
		});
	});

	it("clears a remembered active book the device no longer holds", () => {
		expect(resolveSingleBookSyncTarget("", "2a41e018", ["2a41e018"])).toEqual({
			kind: "none",
			staleActiveId: "2a41e018",
		});
		expect(resolveSingleBookSyncTarget("57569a1c", "2a41e018", ["2a41e018"])).toEqual({
			kind: "unknown",
			deviceHash: "57569a1c",
			staleActiveId: "2a41e018",
		});
	});
});
