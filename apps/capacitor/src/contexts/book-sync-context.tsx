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
import { ble } from "../services/ble";
import { queries } from "../services/db/queries";
import { log } from "../utils/log";
import { useBLE } from "./ble-context";

interface BookSyncContextType {
	/** ID (8-char hex) of the book currently marked as active (on device), or null. */
	activeBookId: string | null;
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
	 * @param bookId    ID (8-char hex) of the book to transfer
	 * @param onProgress  Called with 0–100 during transfer
	 */
	transferBook: (bookId: string, onProgress?: (pct: number) => void) => Promise<void>;

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

	const [activeBookId, setActiveBookId] = useState<string | null>(null);
	const [devicePosition, setDevicePosition] = useState<number | null>(null);
	const [isTransferring, setIsTransferring] = useState(false);
	const [transferProgress, setTransferProgress] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Keep a ref in sync with state so callbacks can read the latest value
	// without being stale closures (avoids re-registering onConnected every render).
	const activeBookIdRef = useRef<string | null>(null);

	// Avoid double-running the initial load
	const loadedRef = useRef(false);

	// Helper: update both state and ref together
	const updateActiveBookId = useCallback((id: string | null) => {
		activeBookIdRef.current = id;
		setActiveBookId(id);
	}, []);

	// Load the current active book from the DB once it's ready
	useEffect(() => {
		if (loadedRef.current) return;
		loadedRef.current = true;

		queries.getBooks().then((allBooks) => {
			const active = allBooks.find((b) => b.isActive);
			updateActiveBookId(active?.id ?? null);
		});
	}, [updateActiveBookId]);

	// ------------------------------------------------------------------
	// Position sync
	// ------------------------------------------------------------------

	const syncPosition = useCallback(async () => {
		if (!isConnected) return;

		// ── Step 1: Read storage info (includes book_hash) ──
		// This tells us which book the device currently has, so we can verify
		// it matches our active book before syncing the position.
		const storageResult = await ble.readStorage();
		const deviceBookHash = storageResult.success ? (storageResult.data?.book_hash ?? "") : "";

		const currentBookId = activeBookIdRef.current;

		// ── Step 2: Book identity check ──
		// The device's book_hash is the same 8-char hex as our book.id.
		// If they don't match, the device is out of sync.
		if (currentBookId != null) {
			if (!deviceBookHash || deviceBookHash !== currentBookId) {
				log.warn(
					"booksync",
					`book mismatch — device has "${deviceBookHash}", app expects "${currentBookId}". Clearing isActive.`,
				);
				await queries.updateBook(currentBookId, { isActive: false });
				updateActiveBookId(null);
				return;
			}
		} else if (!deviceBookHash) {
			// Neither side has a book — nothing to sync
			return;
		} else {
			// Device has a book but app doesn't know which one is active.
			// Check if any book in the DB matches the device hash (= book id).
			const allBooks = await queries.getBooks();
			const match = allBooks.find((b) => b.id === deviceBookHash);
			if (match) {
				log("booksync", `found matching book in DB (id=${match.id}), restoring isActive`);
				await queries.setActiveBook(match.id);
				updateActiveBookId(match.id);
				// Fall through to position sync with the restored book
			} else {
				// Device has a book we don't recognise — no action
				return;
			}
		}

		// ── Step 3: Position sync ──
		const result = await ble.readPosition();
		if (!result.success || result.data == null) {
			log.warn("booksync", "readPosition failed:", result.error);
			return;
		}

		const devicePos = result.data;

		// Resolve conflict: take whichever position is further ahead.
		// This handles the case where the user read on the app since the last
		// device session — we don't want the device to clobber app progress.
		let winner = devicePos;
		// Re-read ref in case it was updated above
		const confirmedBookId = activeBookIdRef.current;

		if (confirmedBookId != null) {
			const book = await queries.getBook(confirmedBookId);
			const appPos = book?.position ?? 0;

			if (appPos > devicePos) {
				// App is ahead — push its position to the device
				winner = appPos;
				await ble.writePosition(appPos);
				log("booksync", `app ahead (${appPos} > ${devicePos}), pushed to device`);
			} else if (devicePos > appPos) {
				// Device is ahead — persist into DB
				await queries.updateBook(confirmedBookId, { position: devicePos, lastRead: Date.now() });
				log("booksync", `device ahead (${devicePos} > ${appPos}), saved to DB`);
			}
			// If equal, nothing to do
		}

		setDevicePosition(winner);
	}, [isConnected, updateActiveBookId]); // activeBookId intentionally omitted — read via ref

	const pushPosition = useCallback(
		async (position: number) => {
			if (!isConnected) return;
			const result = await ble.writePosition(position);
			if (!result.success) {
				log.warn("booksync", "writePosition failed:", result.error);
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
		async (bookId: string, onProgress?: (pct: number) => void) => {
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

				// Pass the book id as the filename in the START frame.
				// The ESP32 saves it as book.hash after a successful transfer so
				// we can verify the right book is on the device on future connects.
				const result = await ble.transferBook(content.content, bookId, (pct) => {
					setTransferProgress(pct);
					onProgress?.(pct);
				});

				if (!result.success) {
					throw new Error(result.error ?? "Transfer failed");
				}

				// Mark this book as active (deactivates all others atomically)
				await queries.setActiveBook(bookId);
				updateActiveBookId(bookId);

				// Push the app's reading position to the device so it resumes
				// where the user left off in the in-app reader.
				const book = await queries.getBook(bookId);
				const pos = book?.position ?? 0;
				await ble.writePosition(pos);
				setDevicePosition(pos);
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Transfer failed";
				setError(msg);
				log.error("booksync", "transferBook error:", err);
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
