import { describe, expect, it } from "vitest";
import { dataViewToString } from "../../../ble/utils/encoding";
import { normalizeDeviceTitle, resolveSingleBookSyncTarget } from "../sync-target";

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

function lib(...ids: string[]) {
	return ids.map((id) => ({ id, title: `Book ${id}` }));
}

const PRIDE = "Pride and Prejudice";

describe("resolveSingleBookSyncTarget", () => {
	it("reports the logged device book as unknown when the library holds only a re-import", () => {
		const deviceHash = loggedDeviceHash();
		expect(deviceHash).toBe("57569a1c");
		expect(resolveSingleBookSyncTarget({ hash: deviceHash }, null, lib("2a41e018"))).toEqual({
			kind: "unknown",
			deviceHash: "57569a1c",
			staleActiveId: null,
		});
	});

	it("syncs the device's book when the app remembers a different active book", () => {
		expect(
			resolveSingleBookSyncTarget(
				{ hash: loggedDeviceHash() },
				"2a41e018",
				lib("2a41e018", "57569a1c"),
			),
		).toEqual({ kind: "sync", bookId: "57569a1c", restored: true, matchedByTitle: false });
	});

	it("syncs the active book when the device holds it", () => {
		expect(resolveSingleBookSyncTarget({ hash: "57569a1c" }, "57569a1c", lib("57569a1c"))).toEqual({
			kind: "sync",
			bookId: "57569a1c",
			restored: false,
			matchedByTitle: false,
		});
	});

	it("restores the device's book when no book is active", () => {
		expect(resolveSingleBookSyncTarget({ hash: "57569a1c" }, null, lib("57569a1c"))).toEqual({
			kind: "sync",
			bookId: "57569a1c",
			restored: true,
			matchedByTitle: false,
		});
	});

	it("clears a remembered active book the device no longer holds", () => {
		expect(resolveSingleBookSyncTarget({ hash: "" }, "2a41e018", lib("2a41e018"))).toEqual({
			kind: "none",
			staleActiveId: "2a41e018",
		});
		expect(resolveSingleBookSyncTarget({ hash: "57569a1c" }, "2a41e018", lib("2a41e018"))).toEqual({
			kind: "unknown",
			deviceHash: "57569a1c",
			staleActiveId: "2a41e018",
		});
	});

	it("prefers the device's id over a title match", () => {
		const library = [
			{ id: "57569a1c", title: PRIDE },
			{ id: "2a41e018", title: "Other" },
		];
		expect(
			resolveSingleBookSyncTarget({ hash: "57569a1c", title: "Other" }, null, library),
		).toEqual({ kind: "sync", bookId: "57569a1c", restored: true, matchedByTitle: false });
	});

	it("matches the one library book with the device's title when the id is unknown", () => {
		const library = [
			{ id: "2a41e018", title: "Pride and Prejudice." },
			{ id: "0badf00d", title: "Emma" },
		];
		expect(
			resolveSingleBookSyncTarget(
				{ hash: "57569a1c", title: " pride and  PREJUDICE " },
				null,
				library,
			),
		).toEqual({ kind: "sync", bookId: "2a41e018", restored: true, matchedByTitle: true });
	});

	it("matches a title the transfer stripped of non-ASCII and colons", () => {
		const library = [{ id: "2a41e018", title: "Café: Société" }];
		expect(
			resolveSingleBookSyncTarget({ hash: "57569a1c", title: "Caf  Socit" }, null, library),
		).toMatchObject({ kind: "sync", bookId: "2a41e018", matchedByTitle: true });
	});

	it("guesses nothing when two library books share the device's title", () => {
		const library = [
			{ id: "2a41e018", title: PRIDE },
			{ id: "0badf00d", title: PRIDE },
		];
		expect(
			resolveSingleBookSyncTarget({ hash: "57569a1c", title: PRIDE }, "2a41e018", library),
		).toEqual({ kind: "unknown", deviceHash: "57569a1c", staleActiveId: "2a41e018" });
	});

	it("guesses nothing when no library book has the device's title", () => {
		expect(
			resolveSingleBookSyncTarget({ hash: "57569a1c", title: PRIDE }, null, lib("2a41e018")),
		).toEqual({ kind: "unknown", deviceHash: "57569a1c", staleActiveId: null });
	});

	it("guesses nothing from old firmware that sends no title", () => {
		const library = [{ id: "2a41e018", title: PRIDE }];
		expect(resolveSingleBookSyncTarget({ hash: "57569a1c" }, null, library)).toEqual({
			kind: "unknown",
			deviceHash: "57569a1c",
			staleActiveId: null,
		});
	});

	it("never matches an empty title", () => {
		const library = [{ id: "2a41e018", title: "???" }];
		expect(resolveSingleBookSyncTarget({ hash: "57569a1c", title: "" }, null, library).kind).toBe(
			"unknown",
		);
		expect(resolveSingleBookSyncTarget({ hash: "57569a1c", title: "!!" }, null, library).kind).toBe(
			"unknown",
		);
	});

	it("follows a link made by an earlier title match", () => {
		const library = [
			{ id: "2a41e018", title: PRIDE },
			{ id: "0badf00d", title: PRIDE },
		];
		const links = { "57569a1c": "2a41e018" };
		expect(
			resolveSingleBookSyncTarget({ hash: "57569a1c", title: PRIDE }, null, library, links),
		).toEqual({ kind: "sync", bookId: "2a41e018", restored: true, matchedByTitle: false });
		expect(resolveSingleBookSyncTarget({ hash: "57569a1c" }, null, library, links)).toMatchObject({
			kind: "sync",
			bookId: "2a41e018",
		});
	});

	it("ignores a link to a deleted book", () => {
		const library = [{ id: "2a41e018", title: "Emma" }];
		expect(
			resolveSingleBookSyncTarget({ hash: "57569a1c" }, null, library, { "57569a1c": "deadbeef" })
				.kind,
		).toBe("unknown");
	});

	it("follows a link after the linked book was renamed", () => {
		const library = [{ id: "2a41e018", title: "Pride and Prejudice (annotated)" }];
		expect(
			resolveSingleBookSyncTarget({ hash: "57569a1c", title: PRIDE }, null, library, {
				"57569a1c": "2a41e018",
			}),
		).toMatchObject({ kind: "sync", bookId: "2a41e018" });
	});

	it("guesses nothing from a title with fewer than three letters left", () => {
		const library = [
			{ id: "2a41e018", title: "第1巻" },
			{ id: "0badf00d", title: "Vol 2" },
		];
		expect(resolveSingleBookSyncTarget({ hash: "57569a1c", title: "1" }, null, library).kind).toBe(
			"unknown",
		);
		expect(
			resolveSingleBookSyncTarget({ hash: "57569a1c", title: "Vol. 2" }, null, library),
		).toMatchObject({ kind: "sync", bookId: "0badf00d" });
	});
});

describe("normalizeDeviceTitle", () => {
	it("drops case, whitespace, punctuation and non-ASCII", () => {
		expect(normalizeDeviceTitle("  The Hobbit: There & Back Again! ")).toBe(
			"thehobbittherebackagain",
		);
	});
});
