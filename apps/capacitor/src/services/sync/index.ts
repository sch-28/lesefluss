import { Preferences } from "@capacitor/preferences";
import type {
	SyncBook,
	SyncHighlight,
	SyncPayload,
	SyncResponse,
	SyncSettings,
} from "@lesefluss/rsvp-core";
import { log } from "../../utils/log";
import { bookKeys, settingsKeys } from "../db/hooks/query-keys";
import { queries } from "../db/queries";
import type { Book, BookContent, Highlight, Settings } from "../db/schema";
import { queryClient } from "../query-client";
import { SYNC_URL, syncAuthClient } from "./auth-client";

/** True when the capacitor app is hosted inside the website (same origin, cookie auth). */
export const IS_WEB_BUILD = import.meta.env.VITE_WEB_BUILD === "true";

/** Sync is available when explicitly configured OR running as web embed. */
export const SYNC_ENABLED = !!SYNC_URL || IS_WEB_BUILD;

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

const TOKEN_KEY = "sync_token";
const LAST_SYNCED_KEY = "sync_last_synced";
const USER_EMAIL_KEY = "sync_user_email";

export async function getToken(): Promise<string | null> {
	const { value } = await Preferences.get({ key: TOKEN_KEY });
	return value;
}

export async function saveToken(token: string): Promise<void> {
	await Preferences.set({ key: TOKEN_KEY, value: token });
}

export async function clearToken(): Promise<void> {
	await Preferences.remove({ key: TOKEN_KEY });
	await Preferences.remove({ key: USER_EMAIL_KEY });
}

export async function getLastSynced(): Promise<number | null> {
	const { value } = await Preferences.get({ key: LAST_SYNCED_KEY });
	return value ? Number(value) : null;
}

export async function getUserEmail(): Promise<string | null> {
	const { value } = await Preferences.get({ key: USER_EMAIL_KEY });
	return value;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function signIn(
	email: string,
	password: string,
): Promise<{ token: string; email: string }> {
	if (!syncAuthClient) throw new Error("Sync not configured");

	try {
		console.log("[auth] signIn attempt", { email, url: SYNC_URL });
		const result = await syncAuthClient.signIn.email({ email, password });
		console.log("[auth] signIn result", JSON.stringify(result, null, 2));
		if (result.error) throw new Error(result.error.message ?? "Sign-in failed");

		const token = result.data.token;
		if (!token) throw new Error("No session token returned");

		await saveToken(token);
		await Preferences.set({ key: USER_EMAIL_KEY, value: email });
		return { token, email };
	} catch (err) {
		console.error("[auth] signIn error", err, String(err));
		throw err;
	}
}

export async function signUp(
	name: string,
	email: string,
	password: string,
): Promise<{ token: string; email: string }> {
	if (!syncAuthClient) throw new Error("Sync not configured");

	const result = await syncAuthClient.signUp.email({
		name,
		email,
		password,
	});
	if (result.error) throw new Error(result.error.message ?? "Sign-up failed");

	const token = result.data.token;
	if (!token) throw new Error("No session token returned");

	await saveToken(token);
	await Preferences.set({ key: USER_EMAIL_KEY, value: email });
	return { token, email };
}

export async function signOut(): Promise<void> {
	if (syncAuthClient) {
		try {
			await syncAuthClient.signOut();
		} catch {
			// Ignore — clearing local token is enough
		}
	}
	await clearToken();
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function syncFetch(path: string, options?: RequestInit): Promise<Response> {
	// Internal callers always pass plain object headers
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...(options?.headers as Record<string, string>),
	};

	if (!IS_WEB_BUILD) {
		// Native app: use Bearer token from Preferences
		const token = await getToken();
		if (!token) throw new Error("Not authenticated");
		headers.Authorization = `Bearer ${token}`;
	}

	const res = await fetch(`${SYNC_URL}${path}`, {
		...options,
		credentials: IS_WEB_BUILD ? "include" : undefined,
		headers,
	});

	if (res.status === 401) {
		if (!IS_WEB_BUILD) await clearToken();
		throw new Error("Session expired");
	}

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Sync failed (${res.status}): ${text}`);
	}

	return res;
}

// ---------------------------------------------------------------------------
// Data mappers (Capacitor SQLite → API payload)
// ---------------------------------------------------------------------------

function bookToSync(book: Book, contentData?: BookContent | null): SyncBook {
	return {
		bookId: book.id,
		title: book.title,
		author: book.author,
		fileSize: book.size,
		wordCount: null,
		position: book.position,
		...(contentData
			? {
					content: contentData.content,
					coverImage: contentData.coverImage,
					chapters: contentData.chapters,
				}
			: {}),
		updatedAt: Math.max(book.lastRead ?? 0, book.addedAt),
	};
}

function settingsToSync(s: Settings): SyncSettings {
	return {
		wpm: s.wpm,
		delayComma: s.delayComma,
		delayPeriod: s.delayPeriod,
		accelStart: s.accelStart,
		accelRate: s.accelRate,
		xOffset: s.xOffset,
		wordOffset: s.wordOffset,
		readerTheme: s.readerTheme as SyncSettings["readerTheme"],
		readerFontSize: s.readerFontSize,
		readerFontFamily: s.readerFontFamily as SyncSettings["readerFontFamily"],
		readerLineSpacing: s.readerLineSpacing,
		readerMargin: s.readerMargin,
		showReadingTime: s.showReadingTime,
		updatedAt: s.updatedAt,
	};
}

function highlightToSync(h: Highlight): SyncHighlight {
	return {
		highlightId: h.id,
		bookId: h.bookId,
		startOffset: h.startOffset,
		endOffset: h.endOffset,
		color: h.color as SyncHighlight["color"],
		note: h.note,
		text: h.text,
		deleted: false,
		createdAt: h.createdAt,
		updatedAt: h.updatedAt,
	};
}

// ---------------------------------------------------------------------------
// Sync lock — prevents concurrent pull/push from racing
// ---------------------------------------------------------------------------

let _syncQueue: Promise<void> = Promise.resolve();

async function withSyncLock(fn: () => Promise<void>): Promise<void> {
	const prev = _syncQueue;
	let resolve: (() => void) | undefined;
	_syncQueue = new Promise((r) => {
		resolve = r;
	});
	try {
		await prev;
		await fn();
	} finally {
		resolve?.();
	}
}

// ---------------------------------------------------------------------------
// Pull (GET /api/sync → merge into local DB)
// ---------------------------------------------------------------------------

/** Returns the set of bookIds the server has content for. */
export async function pullSync(): Promise<Set<string>> {
	const serverHasContent = new Set<string>();
	if (!SYNC_ENABLED) return serverHasContent;

	if (!IS_WEB_BUILD) {
		const token = await getToken();
		if (!token) return serverHasContent;
	}

	await withSyncLock(async () => {
		log("sync", "pulling...");

		// Tell server which books we already have so it skips content for those
		const localBooks = await queries.getBooks();
		const localBookMap = new Map(localBooks.map((b) => [b.id, b]));

		const res = await syncFetch("/api/sync", {
			headers: { "X-Sync-Have": localBooks.map((b) => b.id).join(",") },
		});
		const data: SyncResponse = await res.json();

		let changed = false;

		// --- Merge books ---
		for (const serverBook of data.books) {
			const local = localBookMap.get(serverBook.bookId);

			// Server has content for this book if:
			// - content was returned in this response, OR
			// - the book is in our local DB (we sent it in `have`, server omitted content because it already has it)
			if (serverBook.content || localBookMap.has(serverBook.bookId)) {
				serverHasContent.add(serverBook.bookId);
			}

			if (!local) {
				// New book from server — add locally if it has content
				if (serverBook.content) {
					await queries.addBookWithContent(
						{
							id: serverBook.bookId,
							title: serverBook.title,
							author: serverBook.author,
							fileFormat: "txt", // synced content is always extracted plain text
							size: serverBook.fileSize ?? 0,
							position: serverBook.position,
							isActive: false,
							addedAt: serverBook.updatedAt,
						},
						serverBook.content,
						serverBook.coverImage,
						queries.parseChapters(serverBook.chapters ?? null),
					);
					// Track so highlights for this book aren't skipped
					localBookMap.set(serverBook.bookId, {
						id: serverBook.bookId,
						title: serverBook.title,
						author: serverBook.author,
						fileFormat: "txt",
						filePath: null,
						size: serverBook.fileSize ?? 0,
						position: serverBook.position,
						isActive: false,
						addedAt: serverBook.updatedAt,
						lastRead: null,
					});
					changed = true;
				}
				continue;
			}

			const localUpdatedAt = Math.max(local.lastRead ?? 0, local.addedAt);
			if (serverBook.updatedAt > localUpdatedAt) {
				await queries.updateBook(serverBook.bookId, {
					position: serverBook.position,
				});
				changed = true;
			}
		}

		// --- Merge settings ---
		if (data.settings) {
			const localSettings = await queries.getSettings();
			if (data.settings.updatedAt > localSettings.updatedAt) {
				const serverSettings = data.settings;
				await queries.saveSettings({
					wpm: serverSettings.wpm,
					delayComma: serverSettings.delayComma,
					delayPeriod: serverSettings.delayPeriod,
					accelStart: serverSettings.accelStart,
					accelRate: serverSettings.accelRate,
					xOffset: serverSettings.xOffset,
					wordOffset: serverSettings.wordOffset,
					readerTheme: serverSettings.readerTheme,
					readerFontSize: serverSettings.readerFontSize,
					readerFontFamily: serverSettings.readerFontFamily,
					readerLineSpacing: serverSettings.readerLineSpacing,
					readerMargin: serverSettings.readerMargin,
					showReadingTime: serverSettings.showReadingTime,
				});
				changed = true;
			}
		}

		// --- Merge highlights ---
		const localHighlights = await queries.getAllHighlights();
		const localHighlightMap = new Map(localHighlights.map((h) => [h.id, h]));

		for (const serverHL of data.highlights) {
			if (serverHL.deleted) {
				// Server says deleted — remove locally if exists
				if (localHighlightMap.has(serverHL.highlightId)) {
					await queries.deleteHighlight(serverHL.highlightId);
					changed = true;
				}
				continue;
			}

			// Skip highlights for books not in local DB (avoids orphans)
			if (!localBookMap.has(serverHL.bookId)) continue;

			const local = localHighlightMap.get(serverHL.highlightId);
			if (!local) {
				// New highlight from server — add locally
				await queries.addHighlight({
					id: serverHL.highlightId,
					bookId: serverHL.bookId,
					startOffset: serverHL.startOffset,
					endOffset: serverHL.endOffset,
					color: serverHL.color,
					note: serverHL.note,
					text: serverHL.text ?? null,
					createdAt: serverHL.createdAt,
					updatedAt: serverHL.updatedAt,
				});
				changed = true;
			} else if (serverHL.updatedAt > local.updatedAt) {
				// Server is newer — update locally
				await queries.updateHighlight(serverHL.highlightId, {
					color: serverHL.color,
					note: serverHL.note,
					updatedAt: serverHL.updatedAt,
				});
				changed = true;
			}
		}

		// Invalidate React Query cache so UI reflects pulled changes
		if (changed) {
			queryClient.invalidateQueries({ queryKey: bookKeys.all });
			queryClient.invalidateQueries({ queryKey: settingsKeys.all });
		}

		log("sync", "pull complete");
	});

	return serverHasContent;
}

// ---------------------------------------------------------------------------
// Push (POST /api/sync with full snapshot)
// ---------------------------------------------------------------------------

/** @param serverHasContent bookIds the server already has content for — skip content for those */
export async function pushSync(serverHasContent: Set<string> = new Set()): Promise<void> {
	if (!SYNC_ENABLED) return;

	if (!IS_WEB_BUILD) {
		const token = await getToken();
		if (!token) return;
	}

	await withSyncLock(async () => {
		log("sync", "pushing...");

		const [books, settings, highlights] = await Promise.all([
			queries.getBooks(),
			queries.getSettings(),
			queries.getAllHighlights(),
		]);

		// Fetch content only for books the server doesn't have yet
		const booksWithContent = await Promise.all(
			books.map(async (book) => {
				if (serverHasContent.has(book.id)) {
					return bookToSync(book);
				}
				const contentData = await queries.getBookContent(book.id);
				return bookToSync(book, contentData);
			}),
		);

		const payload: SyncPayload = {
			books: booksWithContent,
			settings: settingsToSync(settings),
			highlights: highlights.map(highlightToSync),
		};

		await syncFetch("/api/sync", {
			method: "POST",
			body: JSON.stringify(payload),
		});

		await Preferences.set({
			key: LAST_SYNCED_KEY,
			value: String(Date.now()),
		});

		log("sync", "push complete");
	});
}

// ---------------------------------------------------------------------------
// Full sync (pull then push)
// ---------------------------------------------------------------------------

export async function fullSync(): Promise<void> {
	const serverHasContent = await pullSync();
	await pushSync(serverHasContent);
}

// ---------------------------------------------------------------------------
// Debounced push — callable from mutation hooks
// ---------------------------------------------------------------------------

let _pushTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleSyncPush(delayMs = 2000): void {
	if (!SYNC_ENABLED) return;

	if (_pushTimer) clearTimeout(_pushTimer);
	_pushTimer = setTimeout(() => {
		_pushTimer = null;
		pushSync().catch((err) => log.error("sync", "debounced push failed:", err));
	}, delayMs);
}
