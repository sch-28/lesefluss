import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, type Rendered, render } from "../../test/render";

type Row = {
	id: string;
	title: string;
	isActive: boolean;
	wordPosition: number;
	updatedAt: number;
};

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
import { readSingleBookLinks } from "../../services/devices/single-book/book-links";
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

function book(id: string, isActive = false, title = `Book ${id}`): Row {
	return { id, title, isActive, wordPosition: 0, updatedAt: 1 };
}

const PRIDE = "Pride and Prejudice";

function deviceSendsTitle(title: string) {
	mocks.ble.readStorage.mockImplementation(async () => {
		const logged = loggedStorage();
		return { ...logged, data: { ...logged.data, title } };
	});
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
	localStorage.clear();
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

describe("single-book syncPosition title fallback (LESE-219)", () => {
	it("syncs the one library book with the device's title and links it", async () => {
		mocks.library = [book("2a41e018", false, PRIDE), book("0badf00d", false, "Emma")];
		deviceSendsTitle(PRIDE);
		await syncWithDeviceAt(5000);

		expect(mocks.queries.setActiveBook).toHaveBeenCalledWith("2a41e018");
		expect(mocks.queries.updateBook).toHaveBeenCalledWith(
			"2a41e018",
			expect.objectContaining({ wordPosition: 1000 }),
		);
		expect(ctx.activeBookId).toBe("2a41e018");
		expect(readSingleBookLinks()).toEqual({ "57569a1c": "2a41e018" });
	});

	it("matches the linked book directly on the next sync", async () => {
		mocks.library = [book("2a41e018", false, PRIDE)];
		deviceSendsTitle(PRIDE);
		await syncWithDeviceAt(5000);
		view?.unmount();
		vi.clearAllMocks();

		// A second book with the same title would make a title match ambiguous.
		mocks.library = [book("2a41e018", false, PRIDE), book("0badf00d", false, PRIDE)];
		await syncWithDeviceAt(6000);

		expect(mocks.queries.updateBook).toHaveBeenCalledWith(
			"2a41e018",
			expect.objectContaining({ wordPosition: 1200 }),
		);
		expect(mocks.warn).not.toHaveBeenCalled();
	});

	it("syncs nothing when two library books share the device's title", async () => {
		mocks.library = [book("2a41e018", false, PRIDE), book("0badf00d", false, PRIDE)];
		deviceSendsTitle(PRIDE);
		await syncWithDeviceAt(5000);

		expect(mocks.ble.readPosition).not.toHaveBeenCalled();
		expect(mocks.queries.updateBook).not.toHaveBeenCalled();
		expect(mocks.warn).toHaveBeenCalledWith("booksync", expect.stringContaining("57569a1c"));
	});

	it("syncs nothing by title for old firmware that sends none", async () => {
		mocks.library = [book("2a41e018", false, PRIDE)];
		await syncWithDeviceAt(5000);

		expect(mocks.ble.readPosition).not.toHaveBeenCalled();
		expect(mocks.queries.updateBook).not.toHaveBeenCalled();
	});
});
