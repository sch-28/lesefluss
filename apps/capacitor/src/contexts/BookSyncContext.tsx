/**
 * BookSyncContext — owns active-book tracking and device position sync.
 *
 * Responsibilities:
 *  - Track which book is currently on the device (activeBookId)
 *  - Sync position from the device on every BLE connect (device is authoritative)
 *  - Push position to the device from the in-app reader
 *  - Orchestrate the full book-transfer flow (upload + mark isActive in DB)
 */

import type React from "react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { ble } from "../ble";
import { queries } from "../db/queries";
import { useBLE } from "./BLEContext";

interface BookSyncContextType {
	/** ID of the book currently marked as active (on device), or null. */
	activeBookId: number | null;
	/** Last byte-offset read from the device, or null if not yet synced. */
	devicePosition: number | null;

	/** Read Position characteristic → update active book position in DB. */
	syncPosition: () => Promise<void>;
	/** Write a byte offset to the device (in-app reader). */
	pushPosition: (position: number) => Promise<void>;

	/**
	 * Upload a book to the device:
	 *  1. Fetch content from DB
	 *  2. Run the chunked BLE transfer
	 *  3. Mark book as isActive in DB, clear other active books
	 *
	 * @param bookId    ID of the book to transfer
	 * @param onProgress  Called with 0–100 during transfer
	 */
	transferBook: (bookId: number, onProgress?: (pct: number) => void) => Promise<void>;

	/** True while a file transfer is in progress. */
	isTransferring: boolean;
	/** 0–100 progress of the current transfer, or null when idle. */
	transferProgress: number | null;
	/** Error message from the last failed operation, or null. */
	error: string | null;
	clearError: () => void;
}

const BookSyncContext = createContext<BookSyncContextType | undefined>(undefined);

export const useBookSync = () => {
	const ctx = useContext(BookSyncContext);
	if (!ctx) throw new Error("useBookSync must be used within BookSyncProvider");
	return ctx;
};

interface Props {
	children: ReactNode;
}

export const BookSyncProvider: React.FC<Props> = ({ children }) => {
	const { isConnected, onConnected } = useBLE();

	const [activeBookId, setActiveBookId] = useState<number | null>(null);
	const [devicePosition, setDevicePosition] = useState<number | null>(null);
	const [isTransferring, setIsTransferring] = useState(false);
	const [transferProgress, setTransferProgress] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Keep a ref in sync with state so callbacks can read the latest value
	// without being stale closures (avoids re-registering onConnected every render).
	const activeBookIdRef = useRef<number | null>(null);

	// Avoid double-running the initial load
	const loadedRef = useRef(false);

	// Helper: update both state and ref together
	const updateActiveBookId = useCallback((id: number | null) => {
		activeBookIdRef.current = id;
		setActiveBookId(id);
	}, []);

	// Load the current active book from the DB on mount
	useEffect(() => {
		if (loadedRef.current) return;
		loadedRef.current = true;

		queries.getBooks().then((allBooks) => {
			const active = allBooks.find((b) => b.isActive);
			updateActiveBookId(active?.id ?? null);
		});
	}, []);

	// ------------------------------------------------------------------
	// Position sync
	// ------------------------------------------------------------------

	const syncPosition = useCallback(async () => {
		if (!isConnected) return;

		const result = await ble.readPosition();
		if (!result.success || result.data == null) {
			console.warn("[booksync] readPosition failed:", result.error);
			return;
		}

		const devicePos = result.data;

		// Resolve conflict: take whichever position is further ahead.
		// This handles the case where the user read on the app since the last
		// device session — we don't want the device to clobber app progress.
		let winner = devicePos;
		// Read from ref so this callback is never stale, even on first connect.
		const currentBookId = activeBookIdRef.current;
		console.log("BOOKSYNC STARTING", currentBookId);

		if (currentBookId != null) {
			const book = await queries.getBook(currentBookId);
			const appPos = book?.position ?? 0;

			if (appPos > devicePos) {
				// App is ahead — push its position to the device
				winner = appPos;
				await ble.writePosition(appPos);
				console.log(`[booksync] app ahead (${appPos} > ${devicePos}), pushed to device`);
			} else if (devicePos > appPos) {
				// Device is ahead — persist into DB
				await queries.updateBook(currentBookId, { position: devicePos, lastRead: Date.now() });
				console.log(`[booksync] device ahead (${devicePos} > ${appPos}), saved to DB`);
			}
			// If equal, nothing to do
		}

		setDevicePosition(winner);
	}, [isConnected]); // activeBookId intentionally omitted — read via ref

	const pushPosition = useCallback(
		async (position: number) => {
			if (!isConnected) return;
			const result = await ble.writePosition(position);
			if (!result.success) {
				console.warn("[booksync] writePosition failed:", result.error);
			} else {
				setDevicePosition(position);
			}
		},
		[isConnected],
	);

	// Register the syncPosition hook so it fires every time BLE connects
	useEffect(() => {
		onConnected(() => {
			syncPosition();
		});
	}, [onConnected, syncPosition]);

	// ------------------------------------------------------------------
	// Book transfer
	// ------------------------------------------------------------------

	const transferBook = useCallback(
		async (bookId: number, onProgress?: (pct: number) => void) => {
			if (!isConnected) {
				setError("Not connected to device");
				return;
			}

			setError(null);
			setIsTransferring(true);
			setTransferProgress(0);

			try {
				const content = await queries.getBookContent(bookId);
				if (!content?.content) {
					throw new Error("Book content not found");
				}

				const result = await ble.transferBook(content.content, "book.txt", (pct) => {
					setTransferProgress(pct);
					onProgress?.(pct);
				});

				if (!result.success) {
					throw new Error(result.error ?? "Transfer failed");
				}

				// Mark this book as active (deactivates all others atomically)
				await queries.setActiveBook(bookId);
				updateActiveBookId(bookId);
				setDevicePosition(0);
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Transfer failed";
				setError(msg);
				console.error("[booksync] transferBook error:", err);
			} finally {
				setIsTransferring(false);
				setTransferProgress(null);
			}
		},
		[isConnected, updateActiveBookId],
	);

	// ------------------------------------------------------------------

	const clearError = useCallback(() => setError(null), []);

	const value: BookSyncContextType = {
		activeBookId,
		devicePosition,
		syncPosition,
		pushPosition,
		transferBook,
		isTransferring,
		transferProgress,
		error,
		clearError,
	};

	return <BookSyncContext.Provider value={value}>{children}</BookSyncContext.Provider>;
};
