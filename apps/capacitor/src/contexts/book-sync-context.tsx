/**
 * BookSyncContext - owns active-book tracking and device position sync.
 *
 * Responsibilities:
 *  - Track which book is currently on the device (activeBookId)
 *  - Sync position from the device on every BLE connect (device is authoritative)
 *  - Push position to the device from the in-app reader
 *  - Orchestrate the full book-transfer flow (upload + mark isActive in DB)
 */

import { type WordPosition, wordPos } from "@lesefluss/core";
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
import { createBleAdapter } from "../services/ble-transport";
import { queries } from "../services/db/queries";
import { MULTI_BOOK_DESCRIPTOR_ID, multiBookDescriptor } from "../services/devices";
import { computeOnDeviceHash, type DeviceCategory } from "../services/devices/hash";
import { buildRsvpDocument, type RsvpChapter } from "../services/rsvp-format/builder";
import { log } from "../utils/log";
import { useBLE } from "./ble-context";
import { useDeviceLibrary } from "./device-library-context";

const DISCONNECTED_DEVICE_ACTIVE_HASH = "";

function parseChapters(json: string | null | undefined): RsvpChapter[] {
	if (!json) return [];
	try {
		const parsed = JSON.parse(json) as Array<{
			title?: string;
			startByte?: number;
		}>;
		if (!Array.isArray(parsed)) return [];
		const out: RsvpChapter[] = [];
		for (const c of parsed) {
			if (typeof c?.title === "string" && typeof c?.startByte === "number") {
				out.push({ title: c.title, startByte: c.startByte });
			}
		}
		return out;
	} catch {
		return [];
	}
}

interface BookSyncContextType {
	/** ID (8-char hex) of the book currently marked as active (on device), or null. */
	activeBookId: string | null;
	/** Last byte-offset read from the device, or null if not yet synced. */
	devicePosition: number | null;

	/** Read Position characteristic → update active book position in DB. */
	syncPosition: () => Promise<void>;
	/** Write a byte offset to the device (in-app reader). */
	pushPosition: (bookId: string, position: number) => Promise<void>;

	/**
	 * Upload a book to the device:
	 *  1. Fetch content from DB
	 *  2. Run the chunked BLE transfer
	 *  3. Mark book as isActive in DB, clear other active books
	 *
	 * @param bookId    ID (8-char hex) of the book to transfer
	 * @param onProgress  Called with 0–100 during transfer
	 */
	transferBook: (
		bookId: string,
		onProgress?: (pct: number) => void,
		category?: DeviceCategory,
	) => Promise<void>;

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
	const { isConnected, onConnected, connectedDescriptorId, connectedDevice } = useBLE();
	const { snapshot: deviceLibrarySnapshot, refresh: refreshDeviceLibrary } = useDeviceLibrary();
	const deviceActiveHash =
		deviceLibrarySnapshot.kind === "multi"
			? deviceLibrarySnapshot.activeHash
			: DISCONNECTED_DEVICE_ACTIVE_HASH;

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

	// App and device tokenize independently; their word counts drift by a small
	// fraction (firmware Latin8 normalization, our TS approximation table, etc.).
	// Scaling word positions proportionally between the two streams keeps the
	// on-screen position visually aligned to within rounding error, without
	// either side needing a byte-perfect tokenizer mirror.
	const scaleWord = (word: number, fromCount: number, toCount: number): number => {
		if (fromCount <= 0 || toCount <= 0 || fromCount === toCount) return word;
		return Math.round((word * toCount) / fromCount);
	};

	const lookupDeviceWordCount = (hash: string): number | null => {
		if (deviceLibrarySnapshot.kind !== "multi") return null;
		const entry = deviceLibrarySnapshot.library.find((e) => e.hash === hash);
		return entry?.words ?? null;
	};

	const scaleForBook = (
		bookWordCount: number,
		hash: string,
		word: number,
		direction: "toDevice" | "toApp",
	): number => {
		const deviceCount = lookupDeviceWordCount(hash) ?? bookWordCount;
		return direction === "toDevice"
			? scaleWord(word, bookWordCount, deviceCount)
			: scaleWord(word, deviceCount, bookWordCount);
	};

	const syncPosition = useCallback(async () => {
		if (!isConnected) return;

		// Multi-book devices have their own per-book position model. Branch
		// early; the rest of this function is single-book esp32 logic.
		if (connectedDescriptorId === MULTI_BOOK_DESCRIPTOR_ID && connectedDevice?.deviceId) {
			const adapter = createBleAdapter(multiBookDescriptor, connectedDevice.deviceId);
			const posRes = await adapter.read("position");
			if (!posRes.success || !posRes.data) {
				log.warn("booksync", "multibook readPosition failed:", posRes.error);
				return;
			}
			const { hash: deviceHash, wordIndex: devicePos } = posRes.data;
			if (!deviceHash || devicePos == null) {
				return;
			}
			// Find which app book maps to this device hash (try both categories).
			const allBooks = await queries.getBooks();
			const matchedBook = allBooks.find((b) => {
				const bookHash = computeOnDeviceHash(b.id, "book");
				const articleHash = computeOnDeviceHash(b.id, "article");
				return bookHash === deviceHash || articleHash === deviceHash;
			});
			if (!matchedBook) {
				return;
			}
			const devicePosAsApp = wordPos(
				scaleForBook(matchedBook.wordCount, deviceHash, devicePos, "toApp"),
			);
			const appPos = matchedBook.wordPosition;
			if (devicePosAsApp > appPos) {
				await queries.updateBook(matchedBook.id, {
					wordPosition: devicePosAsApp,
					lastRead: Date.now(),
				});
				log(
					"booksync",
					`multibook: device ahead (deviceWord=${devicePos} appWord=${devicePosAsApp} > ${appPos}), saved`,
				);
			} else if (appPos > devicePosAsApp) {
				const scaledOut = scaleForBook(matchedBook.wordCount, deviceHash, appPos, "toDevice");
				await adapter.write("position", { hash: deviceHash, wordIndex: wordPos(scaledOut) });
				log(
					"booksync",
					`multibook: app ahead (${appPos} > appView=${devicePosAsApp}), pushed deviceWord=${scaledOut}`,
				);
			}
			return;
		}

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
					`book mismatch - device has "${deviceBookHash}", app expects "${currentBookId}". Clearing isActive.`,
				);
				await queries.updateBook(currentBookId, { isActive: false });
				updateActiveBookId(null);
				return;
			}
		} else if (!deviceBookHash) {
			// Neither side has a book - nothing to sync
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
				// Device has a book we don't recognise - no action
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
		// device session - we don't want the device to clobber app progress.
		let winner = devicePos;
		// Re-read ref in case it was updated above
		const confirmedBookId = activeBookIdRef.current;

		if (confirmedBookId != null) {
			// ADR-0002 §56-57: BookSyncContext owns the BLE byte ↔ word
			// conversion. Read the canonical `word_position` column + the
			// per-book WordIndex; convert to byte at the codec boundary for
			// comparison with the single-book esp32's byte payload.
			const book = await queries.getBook(confirmedBookId);
			const idx = await queries.loadBookWordIndex(confirmedBookId).catch((err) => {
				log.warn("booksync", "loadBookWordIndex failed during device sync:", err);
				return null;
			});
			const appPos =
				book && idx && book.positionUnit === "word" && idx.wordCount > 0
					? idx.byteOf(wordPos(Math.min(Math.max(book.wordPosition, 0), idx.wordCount - 1)))
					: (book?.position ?? 0);

			if (appPos > devicePos) {
				// App is ahead - push its position to the device.
				winner = appPos;
				await ble.writePosition(appPos);
				log("booksync", `app ahead (${appPos} > ${devicePos}), pushed to device`);
			} else if (devicePos > appPos) {
				// Device is ahead - persist into DB. Dual-write byte +
				// canonical word column so both stay current.
				const update: {
					position: number;
					lastRead: number;
					wordPosition?: WordPosition;
				} = {
					position: devicePos,
					lastRead: Date.now(),
				};
				if (idx) update.wordPosition = idx.wordOf(devicePos);
				await queries.updateBook(confirmedBookId, update);
				log("booksync", `device ahead (${devicePos} > ${appPos}), saved to DB`);
			}
			// If equal, nothing to do
		}

		setDevicePosition(winner);
	}, [isConnected, updateActiveBookId, connectedDescriptorId, connectedDevice?.deviceId]); // activeBookId intentionally omitted - read via ref

	const pushPosition = useCallback(
		async (bookId: string, position: number) => {
			if (!isConnected) {
				log("booksync", "pushPosition skipped: not connected");
				return;
			}

			if (connectedDescriptorId === MULTI_BOOK_DESCRIPTOR_ID && connectedDevice?.deviceId) {
				if (!deviceActiveHash) {
					log("booksync", "multibook pushPosition skipped: no active hash in snapshot");
					return;
				}
				const candidates = [
					computeOnDeviceHash(bookId, "book"),
					computeOnDeviceHash(bookId, "article"),
				];
				const matchedHash = candidates.find((h) => h === deviceActiveHash);
				if (!matchedHash) {
					log(
						"booksync",
						`multibook pushPosition skipped: device active=${deviceActiveHash}, ` +
							`candidates=${candidates.join(",")}`,
					);
					return;
				}
				const book = await queries.getBook(bookId);
				if (!book) {
					log("booksync", "multibook pushPosition: book not in DB");
					return;
				}
				const adapter = createBleAdapter(multiBookDescriptor, connectedDevice.deviceId);
				const scaledWord = wordPos(
					scaleForBook(book.wordCount, matchedHash, book.wordPosition, "toDevice"),
				);
				const write = await adapter.write("position", {
					hash: matchedHash,
					wordIndex: scaledWord,
				});
				if (!write.success) {
					log.warn("booksync", "multibook writePosition failed:", write.error);
				} else {
					log(
						"booksync",
						`multibook pushPosition ok: appWord=${book.wordPosition} deviceWord=${scaledWord} hash=${matchedHash}`,
					);
				}
				return;
			}

			const result = await ble.writePosition(position);
			if (!result.success) {
				log.warn("booksync", "writePosition failed:", result.error);
			} else {
				setDevicePosition(position);
			}
		},
		[isConnected, connectedDescriptorId, connectedDevice?.deviceId, deviceActiveHash],
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
		async (
			bookId: string,
			onProgress?: (pct: number) => void,
			category: DeviceCategory = "book",
		) => {
			if (!isConnected) {
				setError("Not connected to device");
				return;
			}

			setError(null);
			setIsTransferring(true);
			setTransferProgress(0);

			try {
				const [content, bookMeta] = await Promise.all([
					queries.getBookContent(bookId),
					queries.getBook(bookId),
				]);
				if (!content?.content) {
					throw new Error("Book content not found");
				}

				const onProgressBoth = (pct: number) => {
					setTransferProgress(pct);
					onProgress?.(pct);
				};

				if (connectedDescriptorId === MULTI_BOOK_DESCRIPTOR_ID && connectedDevice?.deviceId) {
					// Multi-book devices keep many books on disk. Uploading just
					// stockpiles. Which book the device is currently reading is
					// controlled separately via the multibook `active` characteristic
					// (set from the MultiBookSync component). Do NOT touch the app's
					// activeBookId on upload here.
					const parsedChapters = parseChapters(content.chapters);
					const rsvpBytes = buildRsvpDocument({
						title: bookMeta?.title ?? "",
						author: bookMeta?.author,
						body: content.content,
						chapters: parsedChapters,
					});
					const adapter = createBleAdapter(multiBookDescriptor, connectedDevice.deviceId);
					if (!adapter.transferFile) {
						throw new Error("Adapter missing transfer support");
					}
					const result = await adapter.transferFile(
						rsvpBytes,
						{ filename: `${bookId}.rsvp`, category },
						onProgressBoth,
					);
					if (!result.success) {
						throw new Error(result.error ?? "Transfer failed");
					}
					// Give the device's SD bus a moment to flush after the heavy
					// upload before issuing the next BLE writes. Without this slack
					// the active/position writes can time out and the connection
					// drops.
					await new Promise((r) => setTimeout(r, 500));
					// Auto-open the uploaded book on the device (D2). Compute the
					// hash client-side from the same filename + category the
					// firmware will see, so we don't need a round-trip to learn it.
					const newHash = computeOnDeviceHash(bookId, category);
					const activeRes = await adapter.write("active", { hash: newHash });
					if (!activeRes.success) {
						log.warn("booksync", "auto-open after upload failed:", activeRes.error);
					}
					// Seed the device's per-book position with the app's word
					// position so the on-device reader resumes where the user left
					// off in-app.
					if (bookMeta?.wordPosition != null && bookMeta.wordPosition > 0) {
						const seedRes = await adapter.write("position", {
							hash: newHash,
							wordIndex: bookMeta.wordPosition,
						});
						if (!seedRes.success) {
							log.warn("booksync", "seed position after upload failed:", seedRes.error);
						}
					}
					await refreshDeviceLibrary();
				} else {
					// Single-book device holds exactly one book. Uploading replaces
					// the existing book and implicitly makes it active in both app
					// and device.
					const result = await ble.transferBook(
						content.content,
						bookId,
						onProgressBoth,
						bookMeta?.title ?? undefined,
					);
					if (!result.success) {
						throw new Error(result.error ?? "Transfer failed");
					}
					// ADR-0002 BLE seam: read canonical word_position; convert
					// to byte via the just-tokenized WordIndex for the
					// single-book esp32 (the firmware still speaks bytes).
					const book = await queries.getBook(bookId);
					const idx = await queries.loadBookWordIndex(bookId).catch(() => null);
					const pos =
						book && idx && book.positionUnit === "word" && idx.wordCount > 0
							? idx.byteOf(wordPos(Math.min(Math.max(book.wordPosition, 0), idx.wordCount - 1)))
							: (book?.position ?? 0);
					await ble.writePosition(pos);
					setDevicePosition(pos);
					await queries.setActiveBook(bookId);
					updateActiveBookId(bookId);
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Transfer failed";
				setError(msg);
				log.error("booksync", "transferBook error:", err);
			} finally {
				setIsTransferring(false);
				setTransferProgress(null);
			}
		},
		[
			isConnected,
			updateActiveBookId,
			connectedDescriptorId,
			connectedDevice?.deviceId,
			refreshDeviceLibrary,
		],
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
