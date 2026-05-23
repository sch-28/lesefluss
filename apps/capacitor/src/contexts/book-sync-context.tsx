/**
 * BookSyncContext - owns active-book tracking and device position sync.
 *
 * Responsibilities:
 *  - Track which book is currently on the device (activeBookId)
 *  - Sync position from the device on every BLE connect (device is authoritative)
 *  - Push position to the device from the in-app reader
 *  - Orchestrate the full book-transfer flow (upload + mark isActive in DB)
 */

import { BleClient } from "@capacitor-community/bluetooth-le";
import { multibook } from "@lesefluss/ble-config";
import { WordIndex, wordPos } from "@lesefluss/core";
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

const positionNotifyDecoder = new TextDecoder("utf-8");

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
	 * @param onProgress  Called with 0-100 during transfer
	 */
	transferBook: (
		bookId: string,
		onProgress?: (pct: number) => void,
		category?: DeviceCategory,
	) => Promise<void>;

	/** True while a file transfer is in progress. */
	isTransferring: boolean;
	/** 0-100 progress of the current transfer, or null when idle. */
	transferProgress: number | null;
	/** Error message from the last failed operation, or null. */
	error: string | null;
	clearError: () => void;
	/**
	 * Subscribe to device-driven position updates. Fires after the device
	 * notifies a position that's ahead of the app, so consumers (like the
	 * reader page) can move their UI in real time. Returns an unsubscribe.
	 */
	onDevicePositionUpdate: (
		cb: (bookId: string, wordPosition: number) => void,
	) => () => void;
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

	// Snapshot of the device library read through a ref so applyDevicePosition's
	// identity stays stable across library refreshes. Without this the notify
	// subscription effect would churn (stop+start) every time the snapshot
	// changes, e.g. during a library stream or post-upload refresh.
	const deviceLibrarySnapshotRef = useRef(deviceLibrarySnapshot);
	useEffect(() => {
		deviceLibrarySnapshotRef.current = deviceLibrarySnapshot;
	}, [deviceLibrarySnapshot]);

	// Listeners for device-driven position updates. Reader page subscribes so
	// it can move the currently displayed word in real time.
	const devicePositionListenersRef = useRef<Set<(bookId: string, wordPosition: number) => void>>(
		new Set(),
	);
	const onDevicePositionUpdate = useCallback(
		(cb: (bookId: string, wordPosition: number) => void) => {
			devicePositionListenersRef.current.add(cb);
			return () => {
				devicePositionListenersRef.current.delete(cb);
			};
		},
		[],
	);

	// Echo guard. After the app pushes a position to the device, the device
	// echoes it back via its save→notify path. Without this, the echo trips
	// the "device ahead" branch (small scale-rounding diff) or the helper
	// double-fires on a position the app already knows. A blanket tolerance
	// would also swallow legit 1-2 word device-side advances; time-windowing
	// it to the most recent push fixes both.
	const lastPushRef = useRef<{ hash: string; wordIndex: number; ms: number } | null>(null);
	const ECHO_WINDOW_MS = 1500;
	const ECHO_TOLERANCE = 2;

	// Resolve a device-reported (hash, wordIndex) against the local DB. Pushes
	// the app position back to the device when the app is genuinely ahead.
	const applyDevicePosition = useCallback(
		async (deviceHash: string, devicePosRaw: number) => {
			if (!deviceHash) return;
			if (!Number.isFinite(devicePosRaw) || devicePosRaw < 0) return;
			if (connectedDescriptorId !== MULTI_BOOK_DESCRIPTOR_ID || !connectedDevice?.deviceId) {
				return;
			}
			// Drop the echo of our own recent push so it doesn't trip either
			// branch. Match on hash + nearby word within a short window.
			const recentPush = lastPushRef.current;
			if (
				recentPush &&
				recentPush.hash === deviceHash &&
				Date.now() - recentPush.ms < ECHO_WINDOW_MS &&
				Math.abs(devicePosRaw - recentPush.wordIndex) <= ECHO_TOLERANCE
			) {
				return;
			}
			const snapshot = deviceLibrarySnapshotRef.current;
			const lookupCount = (hash: string): number | null => {
				if (snapshot.kind !== "multi") return null;
				return snapshot.library.find((e) => e.hash === hash)?.words ?? null;
			};
			const scale = (
				bookWordCount: number,
				hash: string,
				word: number,
				direction: "toDevice" | "toApp",
			): number => {
				const deviceCount = lookupCount(hash) ?? bookWordCount;
				return direction === "toDevice"
					? scaleWord(word, bookWordCount, deviceCount)
					: scaleWord(word, deviceCount, bookWordCount);
			};

			const allBooks = await queries.getBooks();
			const matchedBook = allBooks.find((b) => {
				const bookHash = computeOnDeviceHash(b.id, "book");
				const articleHash = computeOnDeviceHash(b.id, "article");
				return bookHash === deviceHash || articleHash === deviceHash;
			});
			if (!matchedBook) return;

			const devicePosAsApp = wordPos(
				scale(matchedBook.wordCount, deviceHash, devicePosRaw, "toApp"),
			);
			const appPos = matchedBook.wordPosition;
			if (devicePosAsApp > appPos) {
				await queries.updateBook(matchedBook.id, {
					wordPosition: devicePosAsApp,
					lastRead: Date.now(),
				});
				log(
					"booksync",
					`multibook: device ahead (deviceWord=${devicePosRaw} appWord=${devicePosAsApp} > ${appPos}), saved`,
				);
				devicePositionListenersRef.current.forEach((cb) => {
					try {
						cb(matchedBook.id, devicePosAsApp);
					} catch (err) {
						log.warn("booksync", "device position listener threw:", err);
					}
				});
			} else if (appPos > devicePosAsApp + ECHO_TOLERANCE) {
				const adapter = createBleAdapter(multiBookDescriptor, connectedDevice.deviceId);
				const scaledOut = scale(matchedBook.wordCount, deviceHash, appPos, "toDevice");
				await adapter.write("position", { hash: deviceHash, wordIndex: wordPos(scaledOut) });
				lastPushRef.current = {
					hash: deviceHash,
					wordIndex: scaledOut,
					ms: Date.now(),
				};
				log(
					"booksync",
					`multibook: app ahead (${appPos} > appView=${devicePosAsApp}), pushed deviceWord=${scaledOut}`,
				);
			}
		},
		[connectedDescriptorId, connectedDevice?.deviceId],
	);

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
			await applyDevicePosition(deviceHash, devicePos as number);
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
			// BookSyncContext owns the BLE byte ↔ word conversion (ADR-0002).
			// Convert app's canonical word position to bytes at the codec
			// boundary so the single-book esp32 (byte protocol) can compare.
			const book = await queries.getBook(confirmedBookId);
			const idx = await queries.loadBookWordIndex(confirmedBookId).catch((err) => {
				log.warn("booksync", "loadBookWordIndex failed during device sync:", err);
				return null;
			});
			const appPos =
				book && idx && idx.wordCount > 0
					? idx.byteOf(wordPos(Math.min(Math.max(book.wordPosition, 0), idx.wordCount - 1)))
					: 0;

			if (appPos > devicePos) {
				winner = appPos;
				await ble.writePosition(appPos);
				log("booksync", `app ahead (${appPos} > ${devicePos}), pushed to device`);
			} else if (devicePos > appPos) {
				if (!idx) {
					log.warn("booksync", "device ahead but no WordIndex; cannot persist");
				} else {
					await queries.updateBook(confirmedBookId, {
						wordPosition: idx.wordOf(devicePos),
						lastRead: Date.now(),
					});
					log("booksync", `device ahead (${devicePos} > ${appPos}), saved to DB`);
				}
			}
		}

		setDevicePosition(winner);
	}, [isConnected, updateActiveBookId, connectedDescriptorId, connectedDevice?.deviceId]); // activeBookId intentionally omitted - read via ref

	const pushPosition = useCallback(
		async (bookId: string, word: number) => {
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
					lastPushRef.current = {
						hash: matchedHash,
						wordIndex: scaledWord,
						ms: Date.now(),
					};
					log(
						"booksync",
						`multibook pushPosition ok: appWord=${book.wordPosition} deviceWord=${scaledWord} hash=${matchedHash}`,
					);
				}
				return;
			}

			// Single-book ESP32 protocol is byte-typed. Convert word to byte
			// here. Skip the write entirely when no WordIndex; writing 0
			// would yank the device to the start of the book and clobber
			// the local devicePosition mirror.
			const idx = await queries.loadBookWordIndex(bookId).catch((err) => {
				log.warn("booksync", "loadBookWordIndex failed during pushPosition:", err);
				return null;
			});
			if (!idx || idx.wordCount === 0) {
				log("booksync", `single-book pushPosition skipped: no WordIndex for ${bookId}`);
				return;
			}
			const clamped = Math.max(0, Math.min(idx.wordCount - 1, word));
			const bytePosition = idx.byteOf(wordPos(clamped));
			const result = await ble.writePosition(bytePosition);
			if (!result.success) {
				log.warn("booksync", "writePosition failed:", result.error);
			} else {
				setDevicePosition(bytePosition);
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

	// Subscribe to the position char so device-side reader advances stream into
	// the app in real time. Stays alive for the duration of the multibook
	// connection. Each notify carries the same JSON shape buildPositionJson()
	// emits on a read.
	useEffect(() => {
		if (
			!isConnected ||
			connectedDescriptorId !== MULTI_BOOK_DESCRIPTOR_ID ||
			!connectedDevice?.deviceId
		) {
			return;
		}
		const deviceId = connectedDevice.deviceId;
		const serviceUuid = multibook.serviceUuid;
		const charUuid = multibook.characteristics.position.uuid;

		let cancelled = false;
		const startedAt = Date.now();
		const handle = (view: DataView) => {
			try {
				const text = positionNotifyDecoder.decode(view).replace(/\0+$/, "");
				if (!text) return;
				const parsed = JSON.parse(text) as { hash?: string; wordIndex?: number };
				if (!parsed.hash || typeof parsed.wordIndex !== "number") return;
				if (!Number.isFinite(parsed.wordIndex) || parsed.wordIndex < 0) return;
				void applyDevicePosition(parsed.hash, parsed.wordIndex);
			} catch (err) {
				log.warn("booksync", "position notify decode failed:", err);
			}
		};

		BleClient.startNotifications(deviceId, serviceUuid, charUuid, handle)
			.then(() => {
				if (cancelled) {
					BleClient.stopNotifications(deviceId, serviceUuid, charUuid).catch(() => {});
					return;
				}
				log("booksync", `position notify subscribed in ${Date.now() - startedAt}ms`);
			})
			.catch((err) => {
				log.warn("booksync", "position notify subscribe failed:", err);
			});

		return () => {
			cancelled = true;
			BleClient.stopNotifications(deviceId, serviceUuid, charUuid).catch((err) => {
				log("booksync", "position notify unsubscribe failed (likely disconnected):", err);
			});
		};
	}, [
		isConnected,
		connectedDescriptorId,
		connectedDevice?.deviceId,
		applyDevicePosition,
	]);

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
				// Build a FRESH WordIndex from content for the upload. The lazily
				// rebuilt entries from a deserialized blob can have whitespace
				// embedded in `word` (materializeEntry trims trailing whitespace
				// but not internal whitespace introduced by ellipsis-across-newline
				// merges). Building from content runs the tokenizer state machine
				// which guarantees no whitespace inside any word.
				const uploadWordIndex = WordIndex.build(content.content);

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
					log(
						"booksync",
						`multibook upload: bookId=${bookId} version=2 wordCount=${uploadWordIndex.wordCount} chapters=${parsedChapters.length}`,
					);
					const rsvpBytes = buildRsvpDocument({
						title: bookMeta?.title ?? "",
						author: bookMeta?.author,
						body: content.content,
						chapters: parsedChapters,
						wordIndex: uploadWordIndex,
						version: 2,
					});
					const text = new TextDecoder().decode(rsvpBytes);
					const blines = text.split("\n");
					const wIdx = blines.findIndex((l) => l.startsWith("@words "));
					const pIdx = blines.findIndex((l) => l.startsWith("@paragraphs "));
					const cIdx = blines.findIndex((l) => l.startsWith("@chapters "));
					const wordLines = pIdx > wIdx ? pIdx - wIdx - 1 : -1;
					const paraLines = cIdx > pIdx ? cIdx - pIdx - 1 : -1;
					const chapLines = cIdx >= 0 ? blines.length - cIdx - 2 : -1;
					log(
						"booksync",
						`multibook upload: rsvp size=${rsvpBytes.byteLength}B totalLines=${blines.length} wordLines=${wordLines} listEntries=${uploadWordIndex.wordCount} paraLines=${paraLines} chapLines=${chapLines}`,
					);
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
						book && idx && idx.wordCount > 0
							? idx.byteOf(wordPos(Math.min(Math.max(book.wordPosition, 0), idx.wordCount - 1)))
							: 0;
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
		onDevicePositionUpdate,
	};

	return <BookSyncContext.Provider value={value}>{children}</BookSyncContext.Provider>;
};
