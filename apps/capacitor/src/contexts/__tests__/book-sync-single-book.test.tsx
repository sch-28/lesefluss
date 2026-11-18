import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, type Rendered, render } from "../../test/render";

type Row = { id: string; isActive: boolean; wordPosition: number; updatedAt: number };

// Storage characteristic value from the LESE-218 logcat, as the device sent it.
const LOGGED_STORAGE_HEX =
	"7B22667265655F6279746573223A2031333639323932382C2022626F6F6B5F68617368223A20223537353639613163222C2022746F74616C5F6279746573223A2031343638303036347D";
const BYTES_PER_WORD = 5;

const mocks = vi.hoisted(() => ({
	library: [] as Row[],
	chapters: [] as Row[],
	ble: {
		readStorage: vi.fn(),
		readPosition: vi.fn(),
		writePosition: vi.fn(async () => ({ success: true })),
	},
	queries: {
		getBooks: vi.fn(),
		getAllBooks: vi.fn(),
		getBook: vi.fn(),
		loadBookWordIndex: vi.fn(),
		updateBook: vi.fn(async () => {}),
		setActiveBook: vi.fn(async () => {}),
		markFirstSitting: vi.fn(async () => {}),
	},
	warn: vi.fn(),
}));

vi.mock("@capacitor-community/bluetooth-le", () => ({ BleClient: {} }));
vi.mock("../../services/ble", () => ({ ble: mocks.ble }));
vi.mock("../../services/ble-transport", () => ({ createBleAdapter: vi.fn() }));
vi.mock("../../services/devices", () => ({
	MULTI_BOOK_DESCRIPTOR_ID: "multi-book",
	multiBookDescriptor: {},
}));
vi.mock("../../services/db/queries", () => ({ queries: mocks.queries }));
vi.mock("../../services/db/queries/books", () => ({
	devicePositionWrite: (wordPosition: number, now: number) => ({
		wordPosition,
		updatedAt: now,
		lastRead: now,
	}),
}));
vi.mock("../../utils/log", () => ({
	log: Object.assign(vi.fn(), { warn: mocks.warn }),
}));
vi.mock("../ble-context", () => ({
	useBLE: () => ({
		isConnected: true,
		onConnected: () => {},
		connectedDescriptorId: "single-book",
		connectedDevice: { deviceId: "64:E8:33:4B:51:7E" },
	}),
}));
vi.mock("../device-library-context", () => ({
	useDeviceLibrary: () => ({ snapshot: { kind: "none" }, refresh: vi.fn() }),
}));

import { dataViewToString } from "../../services/ble/utils/encoding";
import { BookSyncProvider, useBookSync } from "../book-sync-context";

function loggedStorage() {
	const bytes = new Uint8Array(
		LOGGED_STORAGE_HEX.match(/../g)?.map((h) => Number.parseInt(h, 16)) ?? [],
	);
	return { success: true, data: JSON.parse(dataViewToString(new DataView(bytes.buffer))) };
}

let ctx: ReturnType<typeof useBookSync>;
function Probe() {
	ctx = useBookSync();
	return null;
}

let view: Rendered | undefined;

function book(id: string, isActive = false): Row {
	return { id, isActive, wordPosition: 0, updatedAt: 1 };
}

async function syncWithDeviceAt(byteOffset: number) {
	mocks.ble.readPosition.mockResolvedValue({ success: true, data: byteOffset });
	view = await render(
		<BookSyncProvider>
			<Probe />
		</BookSyncProvider>,
	);
	await flush();
	await act(() => ctx.syncPosition());
	await flush();
}

beforeEach(() => {
	mocks.ble.readStorage.mockImplementation(async () => loggedStorage());
	mocks.library = [];
	mocks.chapters = [];
	mocks.queries.getBooks.mockImplementation(async () => mocks.library);
	mocks.queries.getAllBooks.mockImplementation(async () => [...mocks.library, ...mocks.chapters]);
	mocks.queries.getBook.mockImplementation(async (id: string) =>
		[...mocks.library, ...mocks.chapters].find((b) => b.id === id),
	);
	mocks.queries.loadBookWordIndex.mockResolvedValue({
		wordCount: 123181,
		byteOf: (w: number) => w * BYTES_PER_WORD,
		wordOf: (b: number) => Math.floor(b / BYTES_PER_WORD),
	});
});

afterEach(() => {
	view?.unmount();
	view = undefined;
	vi.clearAllMocks();
});

describe("single-book syncPosition (LESE-218)", () => {
	it("warns about the logged device book instead of dropping it silently", async () => {
		mocks.library = [book("2a41e018")];
		await syncWithDeviceAt(5000);

		expect(mocks.ble.readPosition).not.toHaveBeenCalled();
		expect(mocks.queries.updateBook).not.toHaveBeenCalled();
		expect(mocks.warn).toHaveBeenCalledWith("booksync", expect.stringContaining("57569a1c"));
	});

	it("clears a remembered active book the device no longer holds", async () => {
		mocks.library = [book("2a41e018", true)];
		await syncWithDeviceAt(5000);

		expect(mocks.queries.updateBook).toHaveBeenCalledWith(
			"2a41e018",
			{ isActive: false },
			expect.any(Number),
			{ isDeviceLocal: true },
		);
		expect(ctx.activeBookId).toBeNull();
	});

	it("syncs the device's library book even when the app remembers another active book", async () => {
		mocks.library = [book("2a41e018", true), book("57569a1c")];
		await syncWithDeviceAt(5000);

		expect(mocks.queries.setActiveBook).toHaveBeenCalledWith("57569a1c");
		expect(mocks.queries.updateBook).toHaveBeenCalledWith(
			"57569a1c",
			expect.objectContaining({ wordPosition: 1000 }),
		);
		expect(ctx.activeBookId).toBe("57569a1c");
	});

	it("syncs a series chapter the device holds", async () => {
		mocks.chapters = [book("57569a1c")];
		await syncWithDeviceAt(5000);

		expect(mocks.queries.setActiveBook).toHaveBeenCalledWith("57569a1c");

		expect(mocks.queries.updateBook).toHaveBeenCalledWith(
			"57569a1c",
			expect.objectContaining({ wordPosition: 1000 }),
		);
	});

	it("keeps the active book when the storage read fails", async () => {
		mocks.library = [book("57569a1c", true)];
		mocks.ble.readStorage.mockResolvedValueOnce({ success: false, error: "GATT error" });
		await syncWithDeviceAt(5000);

		expect(mocks.queries.updateBook).not.toHaveBeenCalled();
		expect(ctx.activeBookId).toBe("57569a1c");
	});
});
